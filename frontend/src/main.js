import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '@/assets/styles/theme.css'
import App from './App.vue'
import router from '@/router/index.js'
import { permissionDirective, permissionAllDirective, permissionDisabledDirective } from '@/directives/permission'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus)

// 注册权限指令
app.directive('permission', permissionDirective)
app.directive('permission-all', permissionAllDirective)
app.directive('permission-disabled', permissionDisabledDirective)

app.mount('#app')
