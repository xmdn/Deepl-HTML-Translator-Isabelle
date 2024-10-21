const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { exec } = require('child_process');
// const settings = require('./settings.js');
const archiver = require('archiver');
const app = express();
const port = 3000;

var settings;
if(fs.existsSync('./settings_copy.js')){
    settings = require('./settings_copy.js');
}
else{
    settings = require('./settings');
}

app.use(cors());

// Middleware to parse JSON requests
app.use(express.json());

settings = require('./settings_copy.js');
// Simple test page
app.get('/test', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Test Page</title>
        </head>
        <body>
            <h1>Test Node Page</h1>
            <p>The Node.js server is up and running!</p>
        </body>
        </html>
    `);
});


// Endpoint to translate HTML files
app.post('/translate', (req, res) => {
    console.log('Received request:', req.body);
    // Check if the request contains the file name
    const { htmlContent, source, targets } = req.body;
    
    // Validate that all required fields are provided
    if (!htmlContent || !source || !targets) {
        return res.status(400).json({ error: 'Filename, source language, and target language are required' });
    }

    console.log('BEFORE WRITING');

    // Ensure targets is an array, even if it's a single string
    const targetLanguages = Array.isArray(targets) ? targets : targets.split(',').map(t => t.trim());

    // Save the HTML content to a temporary file
    const tempHtmlPath = path.join(__dirname, settings.commonPathOfHtmlFiles, 'test.html');
    fs.writeFileSync(tempHtmlPath, htmlContent);
    console.log('HTML content saved.');

    const outputDir = path.join(__dirname, './test/js_output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const translatedFiles = [];
    
    
    // Helper function to translate for each target language
    const translateForTarget = (targetLang, callback) => {
        console.log('TARGET LANG', targetLang)
        const command = `node oldParser.js --job=DEEPLCOSTSMONEY --source=${source} --target=${targetLang}`;
        exec(command, { cwd: path.join(__dirname) }, (error, stdout, stderr) => {
            if (error || stderr) {
                console.error(`Error executing command for ${targetLang}: ${error || stderr}`);
                return callback(error || stderr);
            }
            const translatedFilePath = path.join(outputDir, `lang_${targetLang}.js`);
            translatedFiles.push(translatedFilePath);
            callback();
        });
    };

    // Translate for all target languages
    const tasks = targetLanguages.map(targetLang => (callback) => translateForTarget(targetLang, callback));
    
    // Perform all translations and zip the result
    const async = require('async');
    async.parallel(tasks, (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to translate files' });
        }

        // Create a zip file containing all the translated files
        const zipPath = path.join(__dirname, 'translated_files.zip');
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip');

        output.on('close', () => {
            console.log(`Zip file created: ${zipPath}, size: ${archive.pointer()} bytes`);
            res.sendFile(zipPath, (err) => {
                if (err) {
                    console.error(`Error sending zip file: ${err.message}`);
                    res.status(500).send('Failed to send zip file');
                } else {
                    // Clean up files after sending
                    fs.unlinkSync(zipPath);
                    translatedFiles.forEach(file => fs.unlinkSync(file));
                }
            });
        });

        archive.on('error', (err) => {
            console.error(`Error creating zip file: ${err.message}`);
            res.status(500).send('Failed to create zip file');
        });

        archive.pipe(output);

        // Append each translated file to the zip
        translatedFiles.forEach((filePath) => {
            archive.file(filePath, { name: path.basename(filePath) });
        });

        archive.finalize();
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at 0.0.0.0:${port}`);
});
