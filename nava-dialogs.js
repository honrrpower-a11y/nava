/* NAVA branded confirmation and input dialogs. */
(() => {
 "use strict";
 let active=null;
 const $=id=>document.getElementById(id);
 function close(value){
  if(!active)return;
  const {overlay,resolve,previous}=active;
  active=null;overlay.remove();document.removeEventListener("keydown",onKey);
  if(previous?.isConnected)previous.focus();
  resolve(value);
 }
 function onKey(e){if(e.key==="Escape"){e.preventDefault();close(null)}}
 function open({title="نوا",message="",inputValue=null,placeholder="",confirmText="تأیید",danger=false}={}){
  if(active)close(null);
  return new Promise(resolve=>{
   const overlay=document.createElement("div");overlay.className="nava-dialog-overlay";
   overlay.innerHTML='<section class="nava-dialog" role="dialog" aria-modal="true" aria-labelledby="navaDialogTitle" aria-describedby="navaDialogMessage"><div class="nava-dialog-brand"><span class="nava-dialog-mark">N</span><span>نوا</span></div><h2 id="navaDialogTitle"></h2><p id="navaDialogMessage"></p><input class="nava-dialog-input" type="text" maxlength="180"><div class="nava-dialog-actions"><button type="button" class="nava-dialog-cancel">انصراف</button><button type="button" class="nava-dialog-confirm"></button></div></section>';
   const titleNode=overlay.querySelector("#navaDialogTitle"),messageNode=overlay.querySelector("#navaDialogMessage"),input=overlay.querySelector(".nava-dialog-input"),ok=overlay.querySelector(".nava-dialog-confirm"),cancel=overlay.querySelector(".nava-dialog-cancel");
   titleNode.textContent=title;messageNode.textContent=message;ok.textContent=confirmText;
   ok.classList.toggle("is-danger",!!danger);
   input.hidden=inputValue===null;input.value=inputValue===null?"":String(inputValue);input.placeholder=placeholder;
   const previous=document.activeElement;
   active={overlay,resolve,previous};
   cancel.addEventListener("click",()=>close(null));
   ok.addEventListener("click",()=>close(inputValue===null?true:input.value));
   overlay.addEventListener("click",e=>{if(e.target===overlay)close(null)});
   document.body.append(overlay);document.addEventListener("keydown",onKey);
   requestAnimationFrame(()=>{(inputValue===null?ok:input).focus();if(inputValue!==null)input.select()});
  });
 }
 window.navaConfirm=(message,options={})=>open({message,...options});
 window.navaPrompt=(message,value="",options={})=>open({message,inputValue:value,...options});
})();