Bars grow left when tokenx underestimates and right when it overestimates; the axis spans the ±20% per-sample deviation bound enforced in CI.

```
                                                          under ◂·▸ over
Cyrillic text (ru)                       35 →     36             │█             +2.86%
Greek text (el)                          37 →     40             │████          +8.11%
Emoji-heavy chat messages                39 →     41             │███           +5.13%
JSON payload (formatted)                 96 →     92           ██│              -4.17%
JSON payload (minified)                  62 →     62             │               0.00%
Metamorphosis by Franz Kafka (en)    31,796 → 32,516             │█             +2.26%
Die Verwandlung by Franz Kafka (de)  35,309 → 34,167           ██│              -3.23%
道德經 by Laozi (zh)                  11,712 → 11,679             │              -0.28%
羅生門 by Akutagawa Ryūnosuke (ja)     9,517 → 10,664             │██████       +12.05%
TypeScript ES5 Type Declarations     49,464 → 55,757             │██████       +12.72%
```

Mean deviation across all samples: **5.08%**
