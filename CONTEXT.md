# tokenx

Heuristic token count estimation for LLM text – trading a few percent of accuracy for near-zero bundle size, no tokenizer data files, and linear speed.

## Language

### Estimation

**Token**:
The unit of LLM text measurement that tokenx estimates. Calibrated against the reference tokenizer; every count is an estimate, never exact.
_Avoid_: word, character

**Reference tokenizer**:
The real tokenizer estimates are measured against – OpenAI's `o200k_base` encoding, the one current OpenAI models use.
_Avoid_: cl100k_base (legacy), "the tokenizer"

**Segment**:
The atomic unit of estimation – a whitespace run, a punctuation run, or the text between them; in Chinese and Japanese, a whole clause with the punctuation that closes it. Priced as a whole; only slicing ever cuts one.
_Avoid_: word, token

**Estimation rule**:
One way of pricing a segment – a Language config, the CJK script rates, or the Default ratio, among others. Each segment is priced by the first rule that applies.

**Language config**:
An Estimation rule pairing a pattern with the characters-per-token ratio that prices the segments it matches – an accented language, a script, or emoji. tokenx ships built-in configs; Custom language configs come from the caller.
_Avoid_: language rule, locale, language pack

**Custom language config**:
A Language config supplied by the caller, checked before the built-in configs and every other Estimation rule except whitespace. Custom configs extend the built-ins; no option switches them off.
_Avoid_: override, replacement config

**Default ratio**:
The average characters per token for a segment no other Estimation rule prices, such as a word in a script without a Language config.
_Avoid_: fallback ratio

### Accuracy

**Deviation**:
The relative difference between an estimated count and the reference tokenizer's count for the same text. Positive when tokenx overestimates, negative when it underestimates.
_Avoid_: accuracy percentage, error rate

**Deviation bound**:
The largest Deviation magnitude a single sample or a mean may reach before the test run fails. Each corpus and the Heuristic buckets carry their own; a Documented gap carries none.
_Avoid_: tolerance, accuracy bound

**Sample corpus**:
The fixed set of documents the shipped ratios are calibrated against – the single source for both the published benchmark and the tightest Deviation bounds.
_Avoid_: benchmark corpus

**Holdout corpus**:
Texts deliberately kept out of every calibration decision, measured only to check that calibration generalizes beyond the Sample corpus and Heuristic buckets. Held to a looser Deviation bound; tuning anything against them retires them.
_Avoid_: validation set, test corpus

**Heuristic bucket**:
A group of inputs that all exercise one Estimation rule, recording where that rule currently lands. Held to a Deviation bound unless it records a Documented gap.

**Documented gap**:
An input class whose Deviation tokenx knowingly leaves outside the Deviation bounds instead of fitting a rule to it, such as scripts without a Language config.
_Avoid_: known issue, limitation, outlier

**Register**:
The variety of language a text is written in – everyday prose, technical documentation, machine-generated payload. Moves Deviation more than the script does.
_Avoid_: genre, domain, tone

### Chunking

**Chunk**:
A contiguous run of whole segments produced by splitting, closed once it reaches the Target chunk size. Without Overlap, the chunks concatenate back to the original text.

**Target chunk size**:
The estimated token count at which a chunk closes. A soft threshold – a chunk may exceed it when a single segment crosses the boundary.
_Avoid_: maximum, limit

**Overlap**:
The trailing segments of a chunk repeated at the start of the next chunk to preserve context across boundaries. Always smaller than the Target chunk size, and never a chunk on its own.
