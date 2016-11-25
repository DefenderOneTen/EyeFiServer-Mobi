#!/bin/sh
# NOTE: to install as a service, copy to /usr/local/etc/rc.d
# start: /usr/local/etc/rc.d/S99EyeFiServer.sh start
# stop: /usr/local/etc/rc.d/S99EyeFiServer.sh stop

eyefiserver=/usr/local/packages/eyefiserver/eyefiserver.js
forever=/usr/local/packages/eyefiserver/node_modules/forever/bin/forever

case $1 in
   start)
      echo "Starting EyeFi server..."
      $forever start $eyefiserver 
   ;;

   stop)
      echo "Stopping EyeFi server..."
      $forever stop $eyefiserver 
   ;;

   restart)
      $0 stop
      sleep 1
      $0 start
   ;;
esac
