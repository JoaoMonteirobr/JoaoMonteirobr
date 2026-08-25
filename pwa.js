(function(){
'use strict';
let installPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;document.dispatchEvent(new Event('matos-install-ready'))});
window.addEventListener('appinstalled',()=>{installPrompt=null;localStorage.setItem('matos_pwa_installed','1')});
async function registerSW(){if(!('serviceWorker'in navigator))return null;try{return await navigator.serviceWorker.register('/sw.js?v=1',{scope:'/'})}catch(e){console.warn('Service Worker:',e);return null}}
window.installMatosApp=async function(){if(!installPrompt){alert('No Android, abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.');return}installPrompt.prompt();await installPrompt.userChoice;installPrompt=null};
window.enableMatosNotifications=async function(){if(!('Notification'in window)){alert('Este navegador não oferece notificações web.');return false}const p=await Notification.requestPermission();if(p!=='granted'){alert('As notificações não foram autorizadas. Você pode habilitá-las nas configurações do navegador.');return false}const reg=await registerSW();if(reg){await reg.showNotification('Matos – Notificações ativadas',{body:'Este aparelho está pronto para receber avisos do sistema.',tag:'matos-ativacao',data:{url:'/'}})}localStorage.setItem('matos_notifications','granted');return true};
window.testMatosNotification=async function(){if(Notification.permission!=='granted')return window.enableMatosNotifications();const reg=await navigator.serviceWorker.ready;await reg.showNotification('Teste – Matos',{body:'As notificações deste aparelho estão funcionando.',tag:'matos-teste',data:{url:'/'}});return true};
registerSW();
})();