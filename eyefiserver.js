/*

This work is based on a node.js-project created by Michael Brandt. The following differences and improvements have taken place:

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


  This work is Open Source - modify according to Your needs. For the original license look at https://github.com/michaelbrandt/node-eyefimobiserver


*/

var tardir = "/tmp";
var imgdir = "/volume1/photo/uploads";
var logfile = "/var/log/eyefiserver.log";
var key = "7993e08a5596deefe584dd07e838726c"; // Key is always 00..0

var eyefi_server = require('express')();
var tar = require("tar");
var fs = require("fs");
var parseString = require('xml2js').parseString;
var bodyParser = require('body-parser');
var multer = require('multer');
var serveStatic = require('serve-static');
var http = require('http').Server(eyefi_server);
var iconv = require('iconv-lite');
var md5 = require('md5');
var Buffer = require('buffer').Buffer;
var randomstring = require("randomstring");
var exif = require('exif').ExifImage;
var path = require('path');
var exec = require('child_process').exec;
var winston = require('winston');
var snonceStorage = "";
var snonceStorageLock = false;
//var key 		        = "00000000000000000000000000000000" // Key is always 00..0


var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.File)({ filename: logfile })
    ]
});

// creates a new random generated Server Number Used Once (SNONCE), different for every datatransfer
function getNewSnonce() { return md5(randomstring.generate(40)); }

//get the stored snonce and disables the lock for storing a new snonce
function getStoredSnonce() {
    snonceStorageLock = false;
    return snonceStorage;
}

//saves the snonce created in StartSession-request and locks this information until the credential from the SD Card is authenticated in GetPhotoStatus-request.
// Info: The SD Card will not start up the next process unless  authentication for the last process is done, so this should be unnecessary, but.. you know..just in case ;)
function setStoredSnonce(snonceToStore) {
    if (snonceStorageLock === false) {
        snonceStorage = snonceToStore;
        snonceStorageLock = true;
    }
}

// computes the credentials for authentication, code ported from Python File by Maximilian Golla
function get_credential(string) {
    var beforeMD5 = new Buffer("");
    for (var i = 0; i < string.length; i += 2) {
        var chunk = string[i] + string[i + 1];
        var hexval = "0x" + chunk;
        var dec = parseInt(hexval, 16);
        var myByte = iconv.encode(String.fromCharCode(dec), "latin1");
        beforeMD5 = Buffer.concat([beforeMD5, myByte]);
    }
    return md5(beforeMD5)
};

eyefi_server.use(bodyParser.urlencoded({ extended: true }));
eyefi_server.use(bodyParser.json());

//catching the multipart post request which each got one picture packed as tar
var upload = multer({ dest: tardir }).any();

eyefi_server.post('/api/soap/eyefilm/v1/upload', function (request, response) {

    upload(request, response, function (err) {

        if (err) {
            logger.error('Error occured during upload');
            return;
        }

        var file = request.files[0];

        var imagename = file.originalname.slice(0, -4);
        var tarfile = path.join(tardir, file.filename);
        var imagefile = path.join(imgdir, imagename);

        logger.info("Upload for File " + imagename + " complete");

        var extractor = tar.Extract({ path: imgdir })
            .on('error', function (err) {
                logger.error("An error occurred while extracting File " + file.originalname + " - Details: " + err);
                response.send('<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body><ns1:UploadPhotoResponse xmlns:ns1="http://localhost/api/soap/eyefilm"><success>false</success></ns1:UploadPhotoResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>');
            })
            .on('end', function () {

                // Message
                logger.info("Photo " + imagename + " successfully extracted");

                // Remove Tarfile
                fs.unlinkSync(tarfile);

                // Read EXIF
                new exif({ image: imagefile }, function (error, exifData) {

                    if (error) {
                        logger.error("Photo " + file + " could not get EXIF data - file remains in primary target");
                    }
                    else {
                        // DateTimeOriginal comes like 2016:11:23 15:53:20
                        var dt = exifData.exif.DateTimeOriginal.split(" ");
                        var dir = dt[0].replace(/\:/g, "-");
                        var name = dir + "-" + dt[1].replace(/\:/g, "");
                        var suffix_count = 1;

                        // Create the new directory and filename
                        dir = path.join(imgdir, dir);
                        filename = path.join(dir, name + ".JPG");

                        // Create the directoy if it does not exists
                        if (!fs.existsSync(dir)) {

                            // Make it
                            fs.mkdirSync(dir);

                            // Push the new directory into the photo station index
                            exec('synoindex -A ' + dir, (error, stdout, stderr) => {
                                if (error) {
                                    logger.error('exec error: ${error}');
                                }
                                else {
                                    logger.info("Re-Index of DS-Photo successful");
                                }
                            });
                        }

                        // If the filename already exists, concat with a suffix
                        while (fs.existsSync(filename)) {
                            filename = path.join(dir, name + "_" + suffix_count.toString() + ".JPG");
                            suffix_count += 1;
                        }

                        // Eename the original file
                        fs.renameSync(imagefile, filename);

                        // Log
                        logger.info("Store photo as " + filename);

                        // Push the new file into the photo station index
                        exec('synoindex -a ' + filename, (error, stdout, stderr) => {
                            if (error) {
                                logger.error('exec error: ${error}');
                            }
                            else {
                                logger.info("Re-Index of DS-Photo successful");
                            }
                        });
                    }
                });

                response.send('<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body><ns1:UploadPhotoResponse xmlns:ns1="http://localhost/api/soap/eyefilm"><success>true</success></ns1:UploadPhotoResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>');
            });

        fs.createReadStream(tarfile)
            .on('error', function (err) {
                logger.error("An error occurred while extracting File " + file.originalname + " - Details: " + err);
                response.send('<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body><ns1:UploadPhotoResponse xmlns:ns1="http://localhost/api/soap/eyefilm"><success>false</success></ns1:UploadPhotoResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>');
            })
            .pipe(extractor);
    })
});

// this code stores the XML part in rawBody
eyefi_server.use(function (req, res, next) {
    req.rawBody = '';
    req.setEncoding('utf8');
    req.on('data', function (chunk) { req.rawBody += chunk; });
    req.on('end', next);
});

// catching the post requests sent by SD Card
eyefi_server.post('/api/soap/eyefilm/v1', function (req, res) {
    var headerValue = req.headers.soapaction;

    if (headerValue == "\"urn:StartSession\"") {
        logger.info("Got StartSession request");
        var mac = '';
        var cnonce = '';
        var transfermode = '';
        var transfermodetimestamp = '';
        var credential_server_to_client = '';

        parseString(req.rawBody, function (err, result) {
            var extract = result['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['ns1:StartSession'][0];
            mac = extract['macaddress'][0];
            cnonce = extract['cnonce'][0];
            transfermode = extract['transfermode'][0];
            transfermodetimestamp = extract['transfermodetimestamp'][0];
        });

        var temporarySnonce = getNewSnonce();
        setStoredSnonce(temporarySnonce);
        res.send('<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body><ns1:StartSessionResponse xmlns:ns1="http://localhost/api/soap/eyefilm"><credential>' + get_credential(mac + cnonce + key) + '</credential><snonce>' + temporarySnonce + '</snonce><transfermode>' + transfermode + '</transfermode><transfermodetimestamp>' + transfermodetimestamp + '</transfermodetimestamp><upsyncallowed>false</upsyncallowed></ns1:StartSessionResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>');
    }
    else if (headerValue == "\"urn:GetPhotoStatus\"") {
        logger.info("Got GetPhotoStatus request");
        var mac = '';
        var filename = '';
        var filesize = '';
        var filesignature = '';
        var flags = '';

        parseString(req.rawBody, function (err, result) {
            var extract = result['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['ns1:GetPhotoStatus'][0];
            credential_client_to_server = extract['credential'][0];
            mac = extract['macaddress'][0];
            filename = extract['filename'][0];
            filesize = extract['filesize'][0];
            filesignature = extract['filesignature'][0];
            flags = extract['flags'][0];
        });

        if (get_credential(mac + key + getStoredSnonce()) == credential_client_to_server) {
            res.send('<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body><ns1:GetPhotoStatusResponse xmlns:ns1="http://localhost/api/soap/eyefilm"><fileid>' + 1 + '</fileid><offset>0</offset></ns1:GetPhotoStatusResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>');
        }
        else {
            //this could mean someone tries to attack the server
            logger.error("Eye-Fi SD card failed to authenticate. File " + filename + " not received. ");
            res.send('Nice try!');
        }
    }
    else if (headerValue == "\"urn:MarkLastPhotoInRoll\"") {
        logger.info("Got MarkLastPhotoInRoll request");
        res.send('<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body><ns1:MarkLastPhotoInRoll xmlns:ns1="http://localhost/api/soap/eyefilm" /></SOAP-ENV:Body></SOAP-ENV:Envelope>');
    }
    else {
        res.send('Unknown Request');
    }
});

// takeoff
http.listen(59278);
logger.info("Eye-Fi Server started");
