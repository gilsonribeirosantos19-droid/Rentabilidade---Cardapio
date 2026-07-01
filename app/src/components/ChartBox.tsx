import { useEffect, useRef } from 'react'
import { Chart } from 'chart.js/auto'
import type { ChartConfiguration } from 'chart.js'
import type { CSSProperties } from 'react'

// Wrapper fino do Chart.js: cria o gráfico e destrói/recria quando a config muda.
// Memoize a `config` no componente pai (useMemo) para evitar recriação a cada render.
export function ChartBox({ config, width, height, style }: { config: ChartConfiguration; width?: number; height?: number; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const chart = useRef<Chart | null>(null)
  useEffect(() => {
    if (!ref.current) return
    chart.current = new Chart(ref.current, config)
    return () => { chart.current?.destroy(); chart.current = null }
  }, [config])
  return <canvas ref={ref} width={width} height={height} style={style} />
}
