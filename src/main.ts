import './domain/uuid-polyfill'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import VueKonva from 'vue-konva'
import { Card, Steps, Alert, App as AntApp, AutoComplete, Button, ConfigProvider, Input, InputPassword, Progress, Select, SelectOption, Spin, Switch, Segmented, Skeleton, Modal, Drawer, Dropdown, Menu, Tooltip, Empty, Tag, Form, InputNumber, Slider, Descriptions, Checkbox, Popover, Collapse, Radio, Space, Upload, Divider, Badge, Table, Popconfirm, Pagination } from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import App from './App.vue'
import { router } from './router'
import { installPwa } from './services/pwa'
import { accountAwareErrorHandler, silenceAccountSwitch } from './domain/accountSession'
import './style.css'
import './styles/outfit.css'
import './styles/alert.css'
import './agent/agent.css'
import './recommend/recommend.css'

// Remove only abandoned mannequin experiment settings, preserving outfits and drafts.
try {
  Object.keys(localStorage).filter(key => key.startsWith('yixu.outfit-base.v1:') || key.startsWith('yixu.outfit-rig.v1:')).forEach(key => localStorage.removeItem(key))
} catch { /* Storage access is optional. */ }

const app = createApp(App).use(createPinia()).use(router).use(VueKonva)
// A page made stale by another tab's sign-in refuses every request; those refusals are expected and stay out of the console (#177).
silenceAccountSwitch(window)
app.config.errorHandler = accountAwareErrorHandler()
for (const [name, component] of Object.entries({
  'a-card': Card, 'a-table': Table, 'a-pagination': Pagination, 'a-popconfirm': Popconfirm, 'a-skeleton-image': Skeleton.Image,
  'a-badge': Badge, 'a-upload': Upload, 'a-divider': Divider, 'a-space': Space, 'a-checkbox-group': Checkbox.Group, 'a-steps': Steps, 'a-alert': Alert, 'a-app': AntApp, 'a-button': Button, 'a-config-provider': ConfigProvider,
  'a-radio-group': Radio.Group, 'a-radio-button': Radio.Button, 'a-radio': Radio, 'a-collapse': Collapse, 'a-collapse-panel': Collapse.Panel, 'a-checkbox': Checkbox, 'a-popover': Popover, 'a-textarea': Input.TextArea, 'a-input': Input, 'a-input-password': InputPassword, 'a-auto-complete': AutoComplete, 'a-progress': Progress,
  'a-select': Select, 'a-select-option': SelectOption, 'a-spin': Spin, 'a-switch': Switch, 'a-segmented': Segmented, 'a-skeleton': Skeleton, 'a-modal': Modal,
  'a-drawer': Drawer, 'a-dropdown': Dropdown, 'a-menu': Menu, 'a-menu-item': Menu.Item, 'a-menu-divider': Menu.Divider,
  'a-tooltip': Tooltip, 'a-empty': Empty, 'a-tag': Tag, 'a-checkable-tag': Tag.CheckableTag, 'a-form': Form, 'a-form-item': Form.Item,
  'a-input-number': InputNumber, 'a-slider': Slider, 'a-descriptions': Descriptions, 'a-descriptions-item': Descriptions.Item,
})) app.component(name, component)
installPwa()
app.mount('#app')
