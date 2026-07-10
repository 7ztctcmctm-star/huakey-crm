import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, FunnelChart, RadarChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent, DataZoomComponent, MarkLineComponent, MarkPointComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import 'echarts/feature/grid-contain-label'

echarts.use([
  BarChart, LineChart, PieChart, FunnelChart, RadarChart,
  TitleComponent, TooltipComponent, LegendComponent, GridComponent,
  DataZoomComponent, MarkLineComponent, MarkPointComponent,
  CanvasRenderer
])

export default echarts
