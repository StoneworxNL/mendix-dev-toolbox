// Runs the toolbox in a plain browser, without Studio Pro, for development and the smoke test.
// ?tool=<id> opens a tool directly and ?theme=dark|light pretends to be Studio Pro's theme.
import css from '../src/toolbox/styles.css';
import { mountToolbox } from '../src/toolbox/app.js';

const params = new URLSearchParams(location.search);
document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
mountToolbox(document.getElementById('root'), { hostTheme: params.get('theme'), initialTool: params.get('tool') ?? '' });
