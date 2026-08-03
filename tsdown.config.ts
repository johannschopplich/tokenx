import type { UserConfig } from 'tsdown/config'
import { defineConfig } from 'tsdown/config'

const config: UserConfig[] = [
  defineConfig({
    entry: 'src/index.ts',
    dts: true,
  }),
  defineConfig({
    entry: { cli: 'src/cli/entry.ts' },
    dts: false,
  }),
]

export default config
