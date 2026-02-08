declare module "groq-sdk" {
  class Groq {
    constructor(opts?: any);
    chat: {
      completions: {
        create(opts: any): Promise<any>;
      };
    };
  }
  export default Groq;
}
