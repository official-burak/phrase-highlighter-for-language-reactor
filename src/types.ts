export interface CueToken {
  el: Element;
  surface: string;
  isNotWord: boolean;
}

export interface PhraseHit {
  start: number;
  n: number;
  phrase: string;
  els: Element[];
}

/** Current-line phrase plus its dictionary sense lines. */
export interface PhraseGloss {
  phrase: string;
  senses: string[];
}

export interface PhraseFromTooltip {
  phrase: string;
  word: string;
}

export interface PhrasePopupHit {
  popup: Element;
  phrase: string;
  word: string;
}
