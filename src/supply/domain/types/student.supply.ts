export interface Module {
    title: string;
    text: string;
    topics: Topic[];
}
export interface Topic {
    topic: string;
    description: string;
    examples: string;
    curiosity: string;
    roleplayInstruction: string;
    roleplayDialog: string;
}