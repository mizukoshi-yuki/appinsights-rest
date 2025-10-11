<template>
  <div class="container">
    <h1>Application Insights Logger - Nuxt4 Playground</h1>

    <div class="section">
      <h2>Test Application Insights Events</h2>

      <div class="buttons">
        <button @click="trackEvent">Track Event</button>
        <button @click="trackException">Track Exception</button>
        <button @click="trackTrace">Track Trace</button>
        <button @click="trackMetric">Track Metric</button>
      </div>

      <div v-if="lastAction" class="result">
        <p>Last action: {{ lastAction }}</p>
      </div>
    </div>

    <div class="section">
      <h2>About</h2>
      <p>This is a test playground for the appinsights-rest library with Nuxt4.</p>
      <p>Click the buttons above to send telemetry data to Application Insights.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useNuxtApp } from '#app'

const lastAction = ref('')
const { $appInsights } = useNuxtApp()
const logger = $appInsights

onMounted(() => {
  console.log('[App] Component mounted')
  console.log('[App] Logger available:', !!logger)
  if (!logger) {
    console.error('[App] Logger is not available!')
    lastAction.value = 'Error: Logger not initialized'
  }
})

const trackEvent = async () => {
  if (!logger) {
    console.error('[App] Logger is not available')
    lastAction.value = 'Error: Logger not initialized'
    return
  }
  console.log('[App] Tracking event...')
  await logger.trackEvent('ButtonClicked', {
    buttonName: 'Track Event',
    timestamp: new Date().toISOString()
  })
  lastAction.value = 'Event tracked: ButtonClicked'
  console.log('[App] Event tracked successfully')
}

const trackException = async () => {
  if (!logger) {
    lastAction.value = 'Error: Logger not initialized'
    return
  }
  const error = new Error('This is a test exception')
  await logger.trackException(error, {
    context: 'Test button click'
  })
  lastAction.value = 'Exception tracked: Test exception'
}

const trackTrace = async () => {
  if (!logger) {
    lastAction.value = 'Error: Logger not initialized'
    return
  }
  await logger.trackTrace('This is a test trace message', 1, {
    source: 'playground'
  })
  lastAction.value = 'Trace tracked: Test trace message'
}

const trackMetric = async () => {
  if (!logger) {
    lastAction.value = 'Error: Logger not initialized'
    return
  }
  await logger.trackMetric('TestMetric', Math.random() * 100, {
    unit: 'percentage'
  })
  lastAction.value = 'Metric tracked: TestMetric'
}
</script>

<style scoped>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  font-family: system-ui, -apple-system, sans-serif;
}

h1 {
  color: #2c3e50;
  margin-bottom: 2rem;
}

h2 {
  color: #42b983;
  margin-bottom: 1rem;
}

.section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background-color: #f9f9f9;
}

.buttons {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

button {
  padding: 0.75rem 1.5rem;
  background-color: #42b983;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: background-color 0.2s;
}

button:hover {
  background-color: #359268;
}

.result {
  margin-top: 1rem;
  padding: 1rem;
  background-color: #e8f5e9;
  border-left: 4px solid #42b983;
  border-radius: 4px;
}

.result p {
  margin: 0;
  color: #2c3e50;
}
</style>
