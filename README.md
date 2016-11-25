# EyeFiServer-Mobi
Server package for the use of EyeFi-Mobi-Cards
This work is based on a node.js-project created by Michael Brandt (https://github.com/michaelbrandt/node-eyefimobiserver). The following differences and improvements have taken place:


 * The key seems to be relevant with the current Mobi-Cards, so place it into the key definition below!
 * This script is intented to run on a synology device, so the instructions below are important
 * The uploaded photos are checked via Exif in order to create a folder structure based on the date taken
 * Images are automatically renamed to date taken
 * DS-Photo is forced to recreate the index on the files uploaded

 * TODO:
    - Transfer RAW-Images
    - Generate an installation package for synology

 * Nessecary things to do:

 - Install node.js 4 via the Packet-Manager
 - Log onto the DS via ssh
 - Create a directory in the /usr/local/packages names eyefiserver - don't forget to sudo this as well as the forthcoming procedures
 - Edit the values for tardir, imgdir, logfile and key according to Your needs
 - Change to the directory and copy the eyefiserver.js into this directory
 - Install all nessecary packages:
    sudo npm install express
    sudo npm install tar
    sudo npm install fs
    sudo npm install xml2js
    sudo npm install body-parser
    sudo npm install multer
    sudo npm install serve-static
    sudo npm install http
    sudo npm install iconv-lite
    sudo npm install md5;
    sudo npm install buffer
    sudo npm install randomstring
    sudo npm install exif
    sudo npm install path
    sudo npm install child_process
    sudo npm install winston
    sudo npm install forever

  - Copy the Start/Stop-Routine to /usr/local/etc/rc.d and start it with S99EyeFiServer.sh start
  - Watch the logging in /var/log/eyefiserver.log or as defined in the logfile
