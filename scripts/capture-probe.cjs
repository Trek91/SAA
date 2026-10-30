// Independent capture process used only by the local privacy regression.
const {app}=require('electron');
app.whenReady().then(()=>{});
app.on('window-all-closed',()=>{});
