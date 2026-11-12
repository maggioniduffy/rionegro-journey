/** Minimal DOM overlay: controls hint and the end-of-slice panel. Text is Spanish / English. */
const css = `
.rio-hint{position:fixed;left:0;right:0;bottom:12px;text-align:center;font:14px/1.3 system-ui,sans-serif;color:#fff;
  text-shadow:0 1px 3px rgba(0,0,0,.6);pointer-events:none}
.rio-end{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(10,30,50,.45);
  font:16px/1.4 system-ui,sans-serif;color:#fff;text-align:center}
.rio-end.on{display:flex}
.rio-end div{background:rgba(10,30,50,.85);padding:24px 32px;border-radius:12px;max-width:80vw}
.rio-end h1{margin:0 0 8px;font-size:22px}
.rio-end button{margin-top:16px;padding:10px 22px;font-size:16px;border:0;border-radius:8px;background:#f2a33a;cursor:pointer}
`;

export interface Ui {
  showEnd(show: boolean): void;
}

export function createUi(onRestart: () => void): Ui {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const hint = document.createElement('div');
  hint.className = 'rio-hint';
  hint.textContent = 'A / D o flechas, o mantené pulsada la mitad izquierda/derecha  ·  A / D or arrows, or hold the left/right half of the screen';
  document.body.appendChild(hint);

  const end = document.createElement('div');
  end.className = 'rio-end';
  end.innerHTML =
    '<div><h1>Fin del tramo Aluminé<br>End of the Aluminé stretch</h1>' +
    'Confluencia con el Collón Curá · Confluence with the Collón Curá' +
    '<br><button type="button">Reiniciar / Restart (R)</button></div>';
  end.querySelector('button')!.addEventListener('click', onRestart);
  document.body.appendChild(end);

  return { showEnd: (show) => end.classList.toggle('on', show) };
}
