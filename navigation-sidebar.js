(function(){
'use strict';
var PREF_KEY='matos_sidebar_collapsed';
var mobileOpen=false;
function isMobile(){return window.matchMedia('(max-width:820px)').matches}
function desktopCollapsed(){try{return localStorage.getItem(PREF_KEY)==='1'}catch(e){return false}}
function setDesktopCollapsed(v){try{localStorage.setItem(PREF_KEY,v?'1':'0')}catch(e){}}
function applyState(){var sh=document.querySelector('.shell');if(!sh)return;var mobile=isMobile();sh.classList.toggle('sidebar-open',mobile&&mobileOpen);sh.classList.toggle('sidebar-collapsed',!mobile&&desktopCollapsed());var btn=document.getElementById('nav_toggle');if(btn){var expanded=mobile?mobileOpen:!desktopCollapsed();btn.setAttribute('aria-expanded',expanded?'true':'false');btn.setAttribute('aria-label',mobile?(mobileOpen?'Fechar menu':'Abrir menu'):(desktopCollapsed()?'Expandir menu':'Recolher menu'));btn.textContent=mobileOpen&&mobile?'×':'☰'}}
function toggleSidebar(){if(isMobile())mobileOpen=!mobileOpen;else setDesktopCollapsed(!desktopCollapsed());applyState()}
function closeMobile(){if(isMobile()&&mobileOpen){mobileOpen=false;applyState()}}
function decorate(){var sh=document.querySelector('.shell'),bar=document.querySelector('.appbar'),side=document.querySelector('.side');if(!sh||!bar||!side)return;if(!document.getElementById('nav_toggle')){var btn=document.createElement('button');btn.id='nav_toggle';btn.className='nav-toggle';btn.type='button';btn.textContent='☰';btn.setAttribute('aria-controls','sidebar_navigation');btn.onclick=toggleSidebar;bar.insertBefore(btn,bar.firstChild)}side.id='sidebar_navigation';if(!sh.querySelector('.nav-overlay')){var overlay=document.createElement('div');overlay.className='nav-overlay';overlay.setAttribute('aria-hidden','true');overlay.onclick=closeMobile;sh.appendChild(overlay)}Array.prototype.forEach.call(side.querySelectorAll('[data-page],#logout'),function(el){el.addEventListener('click',closeMobile)});applyState()}
var previousShell=window.shell||shell;shell=function(){var out=previousShell.apply(this,arguments);decorate();return out};window.shell=shell;
window.addEventListener('resize',function(){if(!isMobile())mobileOpen=false;applyState()});
setTimeout(decorate,0);
})();