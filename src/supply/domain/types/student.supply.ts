export interface Module {
  title: string;
  text: string;
  topics: Topic[];
}
export interface Topic {
  topic: string;
  description: string;
  examples: string[];
  curiosity: string;
  roleplayInstruction: string;
  roleplayDialog: string[];
  words: Word[];
  music: Music;
}

export interface Word {
  english: string;
  portuguse: string;
  pronounce: string;
}

export interface Music {
  title: string;
  artist: string;
  youtube: string;
}
