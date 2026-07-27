Bars grow left when tokenx underestimates and right when it overestimates; the axis spans the ±20% per-sample deviation bound enforced in CI.

```
                                                                   under ◂·▸ over
Short English text                                19 →     19             │               0.00%
German text with umlauts                          48 →     49             │█             +2.08%
Russian text (Cyrillic)                           35 →     36             │█             +2.86%
Greek text                                        37 →     40             │████          +8.11%
Emoji-heavy chat messages                         39 →     41             │███           +5.13%
JSON payload                                      96 →     79    █████████│             -17.71%
Metamorphosis by Franz Kafka (English)        31,796 → 32,325             │█             +1.66%
Die Verwandlung by Franz Kafka (German)       35,309 → 33,970           ██│              -3.79%
道德經 by Laozi (Chinese)                     11,712 → 11,427            █│              -2.43%
羅生門 by Akutagawa Ryūnosuke (Japanese)       9,517 → 10,535             │█████        +10.70%
TypeScript ES5 Type Declarations (~4000 loc)  49,464 → 51,883             │██            +4.89%
```

Mean deviation across all samples: **5.40%**
