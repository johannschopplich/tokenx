# Custom Language Configs Extend the Built-Ins

`languageConfigs` used to replace the built-in language configs, so a caller adding a rule for one language silently lost the accent, Cyrillic, Greek, and emoji pricing for every other segment. Custom configs are now checked first and the built-ins still price whatever no custom config matches.

## Consequences

An empty `languageConfigs` keeps the built-ins, and no option switches them off. A catch-all config such as `{ pattern: /\S/, averageCharsPerToken: 4 }` replaces every pricing rule except whitespace; a dedicated switch gets its own option rather than a reinterpretation of this one.
