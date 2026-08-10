import absent from './absent.json'
import blink from './blink.json'
import bold from './bold.json'
import darkside from './darkside.json'
import downpour from './downpour.json'
import mintchoc from './mintchoc.json'
import monzo from './monzo.json'
import pastel from './pastel.json'
import peacockContrast from './peacock-contrast.json'
import peacock from './peacock.json'
import peacocksInSpaceContrast from './peacocks-in-space-contrast.json'
import peacocksInSpace from './peacocks-in-space.json'

export type RainglowTheme = {
  name: string
  colors: Record<string, string>
}

export const rainglowThemes = [
  peacock,
  peacockContrast,
  peacocksInSpace,
  peacocksInSpaceContrast,
  absent,
  blink,
  bold,
  darkside,
  downpour,
  mintchoc,
  monzo,
  pastel
] as RainglowTheme[]
