import { createRouter, createWebHistory } from 'vue-router';
import ScannerPage from '../pages/ScannerPage.vue';
import ReceiverPage from '../pages/ReceiverPage.vue';

const routes = [
  {
    path: '/',
    redirect: '/scanner'
  },
  {
    path: '/scanner',
    name: 'scanner',
    component: ScannerPage
  },
  {
    path: '/receiver',
    name: 'receiver',
    component: ReceiverPage
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
