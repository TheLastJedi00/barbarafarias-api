import { BackgroundTasks } from './background-tasks';

jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { waitUntil } = require('@vercel/functions') as { waitUntil: jest.Mock };

describe('BackgroundTasks', () => {
  it('entrega a promise ao waitUntil e não deixa a falha escapar', async () => {
    const tasks = new BackgroundTasks();
    const done = tasks.run('teste', () => Promise.reject(new Error('caiu')));

    expect(waitUntil).toHaveBeenCalledWith(done);
    await expect(done).resolves.toBeUndefined();
  });

  it('roda a tarefa', async () => {
    const task = jest.fn().mockResolvedValue('ok');
    await new BackgroundTasks().run('teste', task);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
