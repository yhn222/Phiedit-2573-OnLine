import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';

import App from '@/App.vue';
import IndexPage from '@/pages/IndexPage.vue';
import AboutPage from '@/pages/AboutPage.vue';
import DocumentPage from './pages/DocumentPage.vue';

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
app.use(router);
app.mount('#app');
