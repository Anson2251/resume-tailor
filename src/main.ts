import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { initFlowbite } from 'flowbite'

// Tag the OS for Electron title-bar CSS (top strip for the OS controls).
if (window.electronAPI?.platform) {
	document.body.dataset.electronPlatform = window.electronAPI.platform
}

// Fullscreen hides the OS controls — collapse the header's top strip.
window.electronAPI?.onFullscreenChanged?.((fullscreen) => {
	document.body.dataset.electronFullscreen = fullscreen ? 'true' : 'false'
})

const app = createApp(App)
app.mount('#app')
initFlowbite()

// Remove the static boot splash once Vue has mounted; AppSplash takes over
// until the workspace file has loaded.
requestAnimationFrame(() => {
	document.getElementById('boot-splash')?.remove()
})
