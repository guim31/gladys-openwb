// -----------------------------------------------------------------------------
// A failed action: Gladys shows in red what a handler throws, in green what
// it returns. The message is the multi-language object itself.
// -----------------------------------------------------------------------------

export class ActionFailure extends Error {
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}
