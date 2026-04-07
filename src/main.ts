import './styles.css';
import { FlexiSpotApp } from './ui/app';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
    throw new Error('App root not found');
}

const app = new FlexiSpotApp(root);
app.mount();
