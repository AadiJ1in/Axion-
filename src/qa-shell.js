if (!import.meta.env.DEV) throw new Error('Development preview only.');
document.querySelector('#qa-width').addEventListener('change',event=>{document.querySelector('#qa-frame').style.width=`${Number(event.target.value)}px`;});
