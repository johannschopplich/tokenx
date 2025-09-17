import type { UserConfig, UserConfigFn } from 'tsdown/config'
import { defineConfig } from 'tsdown/config'

const config: UserConfig | UserConfigFn = defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  unbundle: true,
})

export default config
