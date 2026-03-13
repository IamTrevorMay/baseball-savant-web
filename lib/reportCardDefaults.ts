import { ElementType, SceneElement, ReportCardBinding, ReportCardObjectType } from './sceneTypes'

export const RC_ELEMENT_CATALOG: { type: ElementType; name: string; desc: string; icon: string }[] = [
  { type: 'rc-stat-box', name: 'Stat Box', desc: 'Single metric display', icon: '#' },
  { type: 'rc-table', name: 'Pitch Table', desc: 'Arsenal table with metrics', icon: '▤' },
  { type: 'rc-heatmap', name: 'Heatmap', desc: 'Zone-binned heatmap', icon: '▦' },
  { type: 'rc-zone-plot', name: 'Zone Plot', desc: 'Pitch locations', icon: '◎' },
  { type: 'rc-movement-plot', name: 'Movement Plot', desc: 'HB vs IVB scatter', icon: '◈' },
  { type: 'rc-bar-chart', name: 'Bar Chart', desc: 'Metric by pitch type', icon: '▬' },
  { type: 'rc-donut-chart', name: 'Donut Chart', desc: 'Pitch usage breakdown', icon: '◔' },
  { type: 'rc-statline', name: 'Statline', desc: 'IP H R SO BB W/L ERA', icon: '═' },
]

export const RC_LAYOUT_CATALOG: { type: ElementType; name: string; desc: string; icon: string }[] = [
  { type: 'text', name: 'Text', desc: 'Title or label', icon: 'T' },
  { type: 'shape', name: 'Shape', desc: 'Rectangle or circle', icon: '□' },
  { type: 'player-image', name: 'Player', desc: 'MLB headshot', icon: '◉' },
  { type: 'image', name: 'Image', desc: 'Upload JPG/PNG', icon: '▣' },
]

export const RC_STAT_METRICS = [
  { key: 'pitches', label: 'Pitch Count' },
  { key: 'ip', label: 'IP' },
  { key: 'er', label: 'ER' },
  { key: 'h', label: 'Hits' },
  { key: 'hr', label: 'HR' },
  { key: 'bb', label: 'BB' },
  { key: 'k', label: 'K' },
  { key: 'whiffs', label: 'Whiffs' },
  { key: 'csw_pct', label: 'CSW%' },
  { key: 'grade_start', label: 'Start Grade' },
  { key: 'grade_stuff', label: 'Stuff Grade' },
  { key: 'grade_command', label: 'Command Grade' },
  { key: 'grade_triton', label: 'Triton Grade' },
  { key: 'fb_velo', label: 'FB Velo' },
  { key: 'fb_ivb', label: 'FB IVB' },
  { key: 'fb_hb', label: 'FB HB' },
  { key: 'fb_ext', label: 'FB Extension' },
  { key: 'fb_havaa', label: 'FB hAVAA' },
  { key: 'cmd_plus', label: 'Cmd+' },
  { key: 'waste_pct', label: 'Waste%' },
  { key: 'avg_missfire', label: 'Missfire' },
  { key: 'avg_cluster', label: 'Cluster Score' },
  { key: 'avg_brink', label: 'Brink Score' },
]

export const RC_TABLE_COLUMNS = [
  { key: 'pitch_name', label: 'Pitch', format: 'raw' },
  { key: 'count', label: '#', format: 'integer' },
  { key: 'avg_velo', label: 'Velo', format: '1f' },
  { key: 'velo_diff', label: 'ΔVelo', format: '1f' },
  { key: 'avg_ivb', label: 'IVB', format: '1f' },
  { key: 'avg_hb', label: 'HB', format: '1f' },
  { key: 'avg_ext', label: 'Ext', format: '2f' },
  { key: 'str_pct', label: 'Str%', format: '1f' },
  { key: 'swstr_pct', label: 'SwStr%', format: '1f' },
  { key: 'csw_pct', label: 'CSW%', format: '1f' },
  { key: 'xslgcon', label: 'xSLGcon', format: '3f' },
  { key: 'stuff_plus', label: 'Stuff+', format: 'integer' },
  { key: 'cmd_plus', label: 'Cmd+', format: 'integer' },
  { key: 'whiffs', label: 'Whiffs', format: 'integer' },
  { key: 'avg_missfire', label: 'Missfire', format: '2f' },
  { key: 'deception_score', label: 'Deception', format: '1f' },
  { key: 'avg_cluster', label: 'Cluster', format: '2f' },
  { key: 'avg_brink', label: 'Brink', format: '2f' },
  { key: 'triton_plus', label: 'Triton+', format: 'integer' },
]

export const RC_BAR_METRICS = [
  { key: 'avg_velo', label: 'Velo' },
  { key: 'avg_ivb', label: 'IVB' },
  { key: 'avg_hb', label: 'HB' },
  { key: 'swstr_pct', label: 'SwStr%' },
  { key: 'csw_pct', label: 'CSW%' },
  { key: 'str_pct', label: 'Str%' },
  { key: 'stuff_plus', label: 'Stuff+' },
  { key: 'cmd_plus', label: 'Cmd+' },
  { key: 'xslgcon', label: 'xSLGcon' },
  { key: 'avg_missfire', label: 'Missfire' },
  { key: 'deception_score', label: 'Deception' },
  { key: 'avg_cluster', label: 'Cluster' },
  { key: 'avg_brink', label: 'Brink' },
  { key: 'triton_plus', label: 'Triton+' },
]

export function defaultReportCardBinding(type: ReportCardObjectType): ReportCardBinding {
  switch (type) {
    case 'rc-stat-box':
      return { objectType: type, metric: 'k', format: 'integer', dataSource: 'starter-card' }
    case 'rc-table':
      return {
        objectType: type,
        columns: [
          { key: 'pitch_name', label: 'Pitch', format: 'raw' },
          { key: 'count', label: '#', format: 'integer' },
          { key: 'avg_velo', label: 'Velo', format: '1f' },
          { key: 'avg_ivb', label: 'IVB', format: '1f' },
          { key: 'avg_hb', label: 'HB', format: '1f' },
          { key: 'swstr_pct', label: 'SwStr%', format: '1f' },
        ],
        dataSource: 'starter-card',
      }
    case 'rc-heatmap':
      return { objectType: type, metric: 'count', colorBy: 'metric', dataSource: 'starter-card' }
    case 'rc-zone-plot':
      return { objectType: type, colorBy: 'pitch_type', dataSource: 'starter-card' }
    case 'rc-movement-plot':
      return { objectType: type, dataSource: 'starter-card' }
    case 'rc-bar-chart':
      return { objectType: type, metric: 'avg_velo', format: '1f', dataSource: 'starter-card' }
    case 'rc-donut-chart':
      return { objectType: type, dataSource: 'starter-card' }
    case 'rc-statline':
      return { objectType: type, dataSource: 'starter-card' }
  }
}
