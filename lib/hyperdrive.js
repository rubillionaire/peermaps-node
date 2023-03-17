var Corestore = require('corestore')
var Hyperdrive = require('hyperdrive')
var Hyperswarm = require('hyperswarm')
var pump = require('pump')

module.exports = function (storage, key) {
  key = key.replace(/^hyper:[\/]*/,'')
  var store = new Corestore(storage)
  var drive = new Hyperdrive(store, Buffer.from(key, 'hex'))
  var swarm = new Hyperswarm()
  var isOpen = false
  var openQueue = []
  function open() {
    isOpen = true
    for (var i = 0; i < openQueue.length; i++) {
      openQueue[i]()
    }
    openQueue = null
  }
  var closed = false
  drive.ready().then(() => {
    swarm.join(drive.discoveryKey)
    if (!isOpen) open()
  }) 
  swarm.on('connection', function (socket, info) {
    pump(socket, drive.replicate(info.client), socket, function (err) {
      if (!closed) console.error('error=',err)
    })
  })
  var storageFn = function (name) {
    return {
      write: function (offset, buf, cb) {
        cb(new Error('write not implemented'))
      },
      truncate: function (length, cb) {
        cb(new Error('truncate not implemented'))
      },
      del: function (cb) {
        cb(new Error('del not implemented'))
      },
      sync: function (cb) {
        cb(new Error('sync not implemented'))
      },
      length: function f (cb) {
        if (!isOpen) {
          return openQueue.push(function () { f(cb) })
        }
        // drive.stat(name, { wait: true }, function (err, stat) {
        //   if (err) cb(err)
        //   else cb(null, stat.size)
        // })
        var s = performance.now()
        drive.entry(name)
          .then((entry) => {
            console.log('length-time', name, performance.now())
            cb(null, entry.value.blob.blockLength)
          })
          .catch((error) => cb(error))
      },
      read: function f (offset, length, cb) {
        if (!isOpen) {
          return openQueue.push(function () { f(offset, length, cb) })
        }
        // drive.open(name, 'r', function g (err, fd) {
        //   if (err) return cb(err)
        //   var buf = Buffer.alloc(length)
        //   drive.read(fd, buf, 0, length, offset, function (err) {
        //     if (err) return cb(err)
        //     cb(err, buf)
        //   })
        // })
        var s = performance.now()
        drive.get(name)
          .then((v) => {
            console.log('read-time', name, performance.now() - s)
            cb(null, v)
          })
          .catch((error) => {
            cb(error)
          })
      },
    }
  }
  storageFn.close = function () {
    closed = true
    swarm.destroy()
  }
  console.log('return storageFn')
  return storageFn
}
