import {
  applyAnswer,
  buildMission,
  Candidate,
  emptyProgress,
  MISSION_SIZE,
  MissionDay,
  practiceSummary,
  PracticeSummary,
  pruneSeen,
  PracticeProgress,
} from './mission-builder';

/** Sorteio previsível: sempre o primeiro — o teste não depende da sorte. */
const first = () => 0;

function candidates(prefix: string, n: number): Candidate[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `${prefix}:c${String(i + 1).padStart(2, '0')}`,
    card: {
      id: `c${i + 1}`,
      english: `${prefix}-${i + 1}`,
      portuguese: 'pt',
      pronounce: 'pr',
      partOfSpeech: 'noun',
      example: 'ex',
      exampleTranslation: 'ext',
    },
  }));
}

describe('pruneSeen (T12)', () => {
  it('mantém só os últimos 90 dias', () => {
    const seen = {
      a: { day: '2026-08-24', correct: true }, // 90 dias antes de 22/11
      b: { day: '2026-08-23', correct: false },
      c: { day: '2026-11-21', correct: true },
    };
    expect(Object.keys(pruneSeen(seen, '2026-11-22')).sort()).toEqual([
      'a',
      'c',
    ]);
  });
});

describe('buildMission (T13)', () => {
  const student = candidates('student_u1', 62);
  const pool = [
    ...candidates('topic_B1_t1', 40),
    ...candidates('topic_B1_t2', 40),
  ];

  it('monta 10: 2 do aluno e 8 do banco', () => {
    const mission = buildMission({
      student,
      pool,
      progress: emptyProgress(),
      random: first,
    });
    expect(mission).toHaveLength(MISSION_SIZE);
    expect(mission.filter((c) => c.source === 'student')).toHaveLength(2);
    expect(mission.filter((c) => c.source === 'topic')).toHaveLength(8);
  });

  it('as do aluno: primeiro as erradas, depois as nunca vistas, na ordem do baralho', () => {
    const progress: PracticeProgress = {
      ...emptyProgress(),
      retry: ['student_u1:c05'],
      seen: {
        'student_u1:c01': { day: '2026-11-20', correct: true },
        'student_u1:c05': { day: '2026-11-21', correct: false },
      },
    };
    const mission = buildMission({ student, pool, progress, random: first });
    expect(
      mission
        .filter((c) => c.source === 'student')
        .map((c) => c.key)
        .sort(),
    ).toEqual(['student_u1:c02', 'student_u1:c05']);
  });

  it('acabadas as nunca vistas, volta nas vistas há mais tempo', () => {
    const seen = Object.fromEntries(
      student.map((c, i) => [
        c.key,
        {
          day: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`,
          correct: true,
        },
      ]),
    );
    seen['student_u1:c03'] = { day: '2026-09-01', correct: true };
    const mission = buildMission({
      student,
      pool,
      progress: { ...emptyProgress(), seen },
      random: first,
    });
    expect(
      mission.filter((c) => c.source === 'student').map((c) => c.key),
    ).toContain('student_u1:c03');
  });

  it('no máximo 4 revisões do banco por missão', () => {
    const retry = pool.slice(0, 7).map((c) => c.key);
    const mission = buildMission({
      student,
      pool,
      progress: { ...emptyProgress(), retry },
      random: first,
    });
    const revisoes = mission.filter((c) => retry.includes(c.key));
    expect(revisoes).toHaveLength(4);
  });

  it('ignora revisão de carta que não está mais disponível', () => {
    const mission = buildMission({
      student,
      pool,
      progress: { ...emptyProgress(), retry: ['topic_B1_apagado:c01'] },
      random: first,
    });
    expect(mission.map((c) => c.key)).not.toContain('topic_B1_apagado:c01');
  });

  it('banco curto: completa com cartas do aluno e continua com 10', () => {
    const mission = buildMission({
      student,
      pool: candidates('topic_A1_t9', 3),
      progress: emptyProgress(),
      random: first,
    });
    expect(mission).toHaveLength(10);
    expect(mission.filter((c) => c.source === 'student')).toHaveLength(7);
  });

  it('as 2 do aluno nunca ficam vizinhas', () => {
    for (let seed = 0; seed < 50; seed++) {
      let x = seed + 1;
      const random = () => {
        x = (x * 16807) % 2147483647;
        return (x - 1) / 2147483646;
      };
      const mission = buildMission({
        student,
        pool,
        progress: emptyProgress(),
        random,
      });
      const at = mission
        .map((c, i) => (c.source === 'student' ? i : -1))
        .filter((i) => i >= 0);
      expect(Math.abs(at[0] - at[1])).toBeGreaterThan(1);
    }
  });

  it('sem cartas do aluno não monta (as 2 são obrigatórias)', () => {
    expect(() =>
      buildMission({
        student: [],
        pool,
        progress: emptyProgress(),
        random: first,
      }),
    ).toThrow();
  });
});

describe('applyAnswer (T16)', () => {
  function day(): MissionDay {
    const cards = buildMission({
      student: candidates('student_u1', 62),
      pool: candidates('topic_B1_t1', 40),
      progress: emptyProgress(),
      random: first,
    });
    return { day: '2026-11-22', cards, answers: {}, score: 0 };
  }

  it('a primeira resposta vale; repetir não muda nada', () => {
    const d = day();
    const key = d.cards[0].key;
    const once = applyAnswer(
      d,
      emptyProgress(),
      key,
      true,
      '2026-11-22T12:00:00Z',
    );
    const twice = applyAnswer(
      once.day,
      once.progress,
      key,
      false,
      '2026-11-22T12:01:00Z',
    );
    expect(twice.day.answers[key].correct).toBe(true);
    expect(twice.day.score).toBe(1);
    expect(twice.changed).toBe(false);
  });

  it('erro entra na revisão; acerto tira', () => {
    const d = day();
    const key = d.cards[0].key;
    const wrong = applyAnswer(d, emptyProgress(), key, false, 'now');
    expect(wrong.progress.retry).toEqual([key]);
    expect(wrong.progress.seen[key]).toEqual({
      day: '2026-11-22',
      correct: false,
    });

    const next = { ...day(), day: '2026-11-23' };
    next.cards[0] = { ...next.cards[0], key };
    const right = applyAnswer(next, wrong.progress, key, true, 'now');
    expect(right.progress.retry).toEqual([]);
  });

  it('carta fora da missão é recusada', () => {
    expect(() =>
      applyAnswer(day(), emptyProgress(), 'outra:c01', true, 'now'),
    ).toThrow();
  });

  it('completar fixa a nota, soma na média do mês e na sequência', () => {
    let d = day();
    let progress: PracticeProgress = {
      ...emptyProgress(),
      streak: 4,
      bestStreak: 4,
      lastCompletedDay: '2026-11-21',
      scoreSum: 80,
      missionsCompleted: 10,
      months: { '2026-11': { scoreSum: 80, missions: 10 } },
    };
    let summary: PracticeSummary | null = null;
    d.cards.forEach((c, i) => {
      const r = applyAnswer(d, progress, c.key, i < 7, 'now');
      d = r.day;
      progress = r.progress;
      summary = r.summary ?? summary;
    });

    expect(d.score).toBe(7);
    expect(d.completedAt).toBe('now');
    expect(progress.streak).toBe(5);
    expect(progress.bestStreak).toBe(5);
    expect(progress.lastCompletedDay).toBe('2026-11-22');
    expect(progress.scoreSum).toBe(87);
    expect(progress.missionsCompleted).toBe(11);
    expect(progress.months['2026-11']).toEqual({ scoreSum: 87, missions: 11 });
    expect(summary).toEqual({ average: 7.9, missions: 11 });
    expect(progress.totalAnswered).toBe(10);
    expect(progress.totalCorrect).toBe(7);
  });

  it('dia furado recomeça a sequência', () => {
    let d = day();
    let progress: PracticeProgress = {
      ...emptyProgress(),
      streak: 9,
      bestStreak: 9,
      lastCompletedDay: '2026-11-19',
    };
    d.cards.forEach((c) => {
      const r = applyAnswer(d, progress, c.key, true, 'now');
      d = r.day;
      progress = r.progress;
    });
    expect(progress.streak).toBe(1);
    expect(progress.bestStreak).toBe(9);
  });
});

describe('practiceSummary', () => {
  it('uma casa decimal; sem missão, nada', () => {
    expect(practiceSummary({ scoreSum: 25, missionsCompleted: 3 })).toEqual({
      average: 8.3,
      missions: 3,
    });
    expect(practiceSummary({ scoreSum: 0, missionsCompleted: 0 })).toBeNull();
  });
});
