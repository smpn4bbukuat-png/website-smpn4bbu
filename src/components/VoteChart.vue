<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import type {CandidateVoteResult} from '@/types/eosis';

Chart.register(
  BarController,
  BarElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
);

const props = defineProps<{
  candidates: CandidateVoteResult[];
  chartType: 'bar' | 'doughnut';
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let chartInstance: Chart | null = null;

const PALETTE = ['#1d4ed8', '#0f766e', '#d97706', '#7c3aed', '#be123c', '#0369a1'];

function renderChart(): void {
  if (!canvasRef.value) return;

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const labels = props.candidates.map(
    (c) => `No. ${c.order_number} · ${c.chairperson_name} & ${c.vice_chairperson_name}`
  );
  const data = props.candidates.map((c) => c.vote_count);
  const colors = props.candidates.map((_, idx) => PALETTE[idx % PALETTE.length]);

  chartInstance = new Chart(canvasRef.value, {
    type: props.chartType,
    data: {
      labels,
      datasets: [
        {
          label: 'Perolehan Suara',
          data,
          backgroundColor: colors,
          borderRadius: props.chartType === 'bar' ? 6 : 0,
          borderWidth: props.chartType === 'doughnut' ? 2 : 0,
          borderColor: '#ffffff',
          maxBarThickness: 56,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: props.chartType === 'doughnut',
          position: 'bottom',
          labels: {
            boxWidth: 12,
            padding: 16,
            font: {
              family: "'Plus Jakarta Sans', sans-serif",
              size: 12,
            },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const candidate = props.candidates[ctx.dataIndex];
              const pct = candidate ? candidate.percentage : 0;
              return ` ${ctx.parsed.y ?? ctx.parsed} suara (${pct}%)`;
            },
          },
        },
      },
      scales:
        props.chartType === 'bar'
          ? {
              y: {
                beginAtZero: true,
                ticks: {
                  precision: 0,
                  font: {
                    family: "'JetBrains Mono', monospace",
                  },
                },
                grid: {
                  color: '#f1f5f9',
                },
              },
              x: {
                ticks: {
                  font: {
                    family: "'Plus Jakarta Sans', sans-serif",
                    size: 12,
                  },
                },
                grid: {
                  display: false,
                },
              },
            }
          : undefined,
    },
  });
}

onMounted(renderChart);
watch(
  () => [props.candidates, props.chartType],
  () => renderChart(),
  {deep: true}
);
onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
});
</script>

<template>
  <div style="position: relative; width: 100%; height: 310px">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>
