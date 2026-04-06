<template>
  <main class="container">
    <h1>Application Insights Logger - Nuxt4 Playground</h1>

    <section class="section">
      <header>
        <h2>Test Application Insights Events</h2>
      </header>

      <div class="buttons">
        <button
          v-for="action in trackActions"
          :key="action.label"
          class="track-button"
          @click="handleTrack(action)"
        >
          {{ action.label }}
        </button>
      </div>

      <output v-if="lastAction !== null" class="result" aria-live="polite">
        Last action: {{ lastAction }}
      </output>
    </section>

    <section class="section">
      <header>
        <h2>About</h2>
      </header>
      <p>This is a test playground for the appinsights-rest library with Nuxt4.</p>
      <p>Click the buttons above to send telemetry data to Application Insights.</p>
    </section>
  </main>
</template>

<script setup lang="ts">
// 1. imports
import { ref } from 'vue'
import { useNuxtApp } from '#app'
import { SeverityLevel } from 'appinsights-rest'
import type { AppInsightsLogger } from 'appinsights-rest'

// 2. types
interface TrackAction {
  label: string
  run: (logger: AppInsightsLogger) => void | Promise<void>
  successMessage: string
}

// 4. composables
const { $appInsights } = useNuxtApp()
const logger = $appInsights as AppInsightsLogger | undefined

// 5. refs
const lastAction = ref<string | null>(null)

// 8. functions
const METRIC_MAX_PERCENT = 100 // upper bound for the random test metric (0–100%)

const trackActions: TrackAction[] = [
  {
    label: 'Track Event',
    run: (l) => l.trackEvent('ButtonClicked', { buttonName: 'Track Event' }),
    successMessage: 'Event tracked: ButtonClicked',
  },
  {
    label: 'Track Exception',
    run: (l) => l.trackException(new Error('This is a test exception'), { context: 'Test button click' }),
    successMessage: 'Exception tracked: Test exception',
  },
  {
    label: 'Track Trace',
    run: (l) => l.trackTrace('This is a test trace message', SeverityLevel.Information, { source: 'playground' }),
    successMessage: 'Trace tracked: Test trace message',
  },
  {
    label: 'Track Metric',
    run: (l) => l.trackMetric('TestMetric', Math.random() * METRIC_MAX_PERCENT, { unit: 'percentage' }),
    successMessage: 'Metric tracked: TestMetric',
  },
]

async function handleTrack(action: TrackAction): Promise<void> {
  if (!logger) {
    lastAction.value = 'Error: Logger not initialized'
    return
  }
  await action.run(logger)
  lastAction.value = action.successMessage
}
</script>

<style scoped>
.container {
  --playground-text: #2c3e50;
  --playground-accent: #42b983;
  --playground-accent-hover: #359268;
  --playground-border: #e0e0e0;
  --playground-bg: #f9f9f9;
  --playground-result-bg: #e8f5e9;

  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  font-family: system-ui, -apple-system, sans-serif;
}

h1 {
  color: var(--playground-text);
  margin-bottom: 2rem;
}

h2 {
  color: var(--playground-accent);
  margin-bottom: 1rem;
}

.section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border: 1px solid var(--playground-border);
  border-radius: 8px;
  background-color: var(--playground-bg);
}

.buttons {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.track-button {
  padding: 0.75rem 1.5rem;
  background-color: var(--playground-accent);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: background-color 0.2s;
}

.track-button:hover {
  background-color: var(--playground-accent-hover);
}

.result {
  display: block;
  margin-top: 1rem;
  padding: 1rem;
  background-color: var(--playground-result-bg);
  border-left: 4px solid var(--playground-accent);
  border-radius: 4px;
  color: var(--playground-text);
}
</style>
