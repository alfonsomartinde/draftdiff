import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfigServer } from './app/app.config.server';

const bootstrap = () => bootstrapApplication(App, appConfigServer);

export default bootstrap;
