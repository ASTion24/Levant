(function () {
  var Filesystem = {
    readFile: function (options) { return window.Capacitor.nativePromise('Filesystem', 'readFile', options); },
    writeFile: function (options) { return window.Capacitor.nativePromise('Filesystem', 'writeFile', options); },
    appendFile: function (options) { return window.Capacitor.nativePromise('Filesystem', 'appendFile', options); },
    deleteFile: function (options) { return window.Capacitor.nativePromise('Filesystem', 'deleteFile', options); },
    mkdir: function (options) { return window.Capacitor.nativePromise('Filesystem', 'mkdir', options); },
    rmdir: function (options) { return window.Capacitor.nativePromise('Filesystem', 'rmdir', options); },
    readdir: function (options) { return window.Capacitor.nativePromise('Filesystem', 'readdir', options); },
    getUri: function (options) { return window.Capacitor.nativePromise('Filesystem', 'getUri', options); },
    stat: function (options) { return window.Capacitor.nativePromise('Filesystem', 'stat', options); },
    rename: function (options) { return window.Capacitor.nativePromise('Filesystem', 'rename', options); },
    copy: function (options) { return window.Capacitor.nativePromise('Filesystem', 'copy', options); },
    requestPermissions: function () { return window.Capacitor.nativePromise('Filesystem', 'requestPermissions', {}); },
    checkPermissions: function () { return window.Capacitor.nativePromise('Filesystem', 'checkPermissions', {}); }
  };

  // 确保全局对象存在
  window.Capacitor = window.Capacitor || {};
  window.Capacitor.Plugins = window.Capacitor.Plugins || {};
  window.Capacitor.Plugins.Filesystem = Filesystem;
  
  console.log('[Levant] Filesystem plugin manually registered.');
})();