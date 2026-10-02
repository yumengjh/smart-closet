import { createApp } from 'vue'
import { createPinia } from 'pinia'
import VueKonva from 'vue-konva'
import { Alert, App as AntApp, AutoComplete, Button, ConfigProvider, Input, InputPassword, Progress, Select, SelectOption, Spin, Switch, Segmented, Skeleton, Modal, Drawer, Dropdown, Menu, Tooltip, Empty, Tag, Form, InputNumber, Slider, Descriptions, Checkbox, Popover, Collapse } from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import App from './App.vue'
import { router } from './router'
import './style.css'
import './styles/outfit.css'
import './agent/agent.css'

// Remove only abandoned mannequin experiment settings, preserving outfits and drafts.
try {
  Object.keys(localStorage).filter(key => key.startsWith('yixu.outfit-base.v1:') || key.startsWith('yixu.outfit-rig.v1:')).forEach(key => localStorage.removeItem(key))
} catch { /* Storage access is optional. */ }

const app = createApp(App).use(createPinia()).use(router).use(VueKonva)
for (const [name, component] of Object.entries({
  'a-alert': Alert, 'a-app': AntApp, 'a-button': Button, 'a-config-provider': ConfigProvider,
  'a-collapse': Collapse, 'a-collapse-panel': Collapse.Panel, 'a-checkbox': Checkbox, 'a-popover': Popover, 'a-textarea': Input.TextArea, 'a-input': Input, 'a-input-password': InputPassword, 'a-auto-complete': AutoComplete, 'a-progress': Progress,
  'a-select': Select, 'a-select-option': SelectOption, 'a-spin': Spin, 'a-switch': Switch, 'a-segmented': Segmented, 'a-skeleton': Skeleton, 'a-modal': Modal,
  'a-drawer': Drawer, 'a-dropdown': Dropdown, 'a-menu': Menu, 'a-menu-item': Menu.Item, 'a-menu-divider': Menu.Divider,
  'a-tooltip': Tooltip, 'a-empty': Empty, 'a-tag': Tag, 'a-form': Form, 'a-form-item': Form.Item,
  'a-input-number': InputNumber, 'a-slider': Slider, 'a-descriptions': Descriptions, 'a-descriptions-item': Descriptions.Item,
})) app.component(name, component)
app.mount('#app')
