import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from '@/App.vue';
import IndexPage from '@/pages/index/MainPage.vue';
import AboutPage from '@/pages/about/MainPage.vue';
import DocumentPage from '@/pages/document/MainPage.vue';

const app = createApp(App);
const routes = [
    { path: '/', name: "Index", component: IndexPage },
    { path: '/about', name: "About", component: AboutPage },
    { path: '/document', name: "Document", component: DocumentPage },
];
const router = createRouter({
    history: createWebHistory(),
    routes
});

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
}
app.use(router);
app.use(ElementPlus);
app.mount('#app');
