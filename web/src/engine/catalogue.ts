// The (property, control type) pairs this tool writes, each one listed in R1
// 3.46.1's GuiInfo.db ControlsAndFunctions.  test/catalogue.test.ts checks
// them against the installed R1, so nothing here is a guess.  Only the pairs
// in use are kept, rather than d&b's whole table.
export const PAIRS = new Set([
  'ArrayProcessing_Enable/8',
  'ChStatus_Gr/8',
  'ChStatus_GrHead/7',
  'ChStatus_InputVoltagePeak/7',
  'ChStatus_Isp/8',
  'ChStatus_MsDelay/3',
  'ChStatus_Ovl/8',
  'Config_ChannelName/9',
  'Config_DelayOn/4',
  'Config_Eq1Enable/4',
  'Config_Eq1Enable/6',
  'Config_Eq2Enable/4',
  'Config_Eq2Enable/6',
  'Config_EqsEnabled/4',
  'Config_Filter1/4',
  'Config_Filter3/3',
  'Config_FreqGenFreq/3',
  'Config_FreqGenLevel/3',
  'Config_FreqGenMode/5',
  'Config_Mute/4',
  'Config_Mute/8',
  'Config_PotiLevel/2',
  'Config_PotiLevel/3',
  'Settings_PwrOn/4',
])
