import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Alert, App as AntApp, Button, ConfigProvider, Input, InputPassword, Progress, Select, SelectOption, Spin, Switch, Segmented, Skeleton, Modal } from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import App from './App.vue'
import { router } from './router'
import './style.css'

const app = createApp(App).use(createPinia()).use(router)
for (const [name, component] of Object.entries({
  'a-alert': Alert, 'a-app': AntApp, 'a-button': Button, 'a-config-provider': ConfigProvider,
  'a-input': Input, 'a-input-password': InputPassword, 'a-progress': Progress,
  'a-select': Select, 'a-select-option': SelectOption, 'a-spin': Spin, 'a-switch': Switch, 'a-segmented': Segmented, 'a-skeleton': Skeleton, 'a-modal': Modal,
})) app.component(name, component)
app.mount('#app')
