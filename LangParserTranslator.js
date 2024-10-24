﻿var querystring = require('querystring');
var cheerio = require('cheerio');
var fs = require('fs');
var os = require("os");
var args = require('yargs').array('target').argv;
var settings;
if(fs.existsSync('./settings_copy.js')){
    settings = require('./settings_copy.js');
}
else{
    settings = require('./settings');
}

var deepl = require("./deeplApi.js");
var Entities = require('html-entities').XmlEntities;
var entities = new Entities();
var changes = []; // The changed texts (keys of the json)
var jsonLangFromParsed = {}; // Will contain json files with languages ["en"], ["de"], etc from freshly parsing HTML --> and new translations
var jsonLangFromLoadedFile = {}; // Will contain the same as above, but from the current loaded files
var curVersion = 1;
var newVersion = 1;
var report = "\nDefault language: " + settings.defaultLanguage;

console.log('BEFORE READ ALL');

/*
 * Start with node LangParserTranslator --job=parseonly/deeplForMoney --source=en --target=de (fr, es, etc OR: all for all languages!!)
 * --job=parseonly will only parse your HTML files and put them into the JSON of the source language. Ignores the --target then
 * --job=DEEPLCOSTSMONEY will parse AND translate with deepl - this costs money through your deepl API! We don't guarantee that this script works!!
 *
 */


var disclaimer = "THIS NODE.JS DEEPL PARSER IS FREE SOFTWARE UNDER MIT LICENSE (c) EasyRadiology GmbH 2020.\n"
+ "---------------------------------------------------------------------------------------------"
+"\n\n TERMS/CONDITIONS: DEEPL TRANSLATIONS COST MONEY!!! WE ARE NOT LIABLE FOR ERRORS IN THE CODE WHICH MAY"
+"\n\n CAUSE YOU, YOUR COMPANY OR ANY THIRD PARTY FINANCIAL DAMAGES !!!!!!!!!!!!"
+"\n\n BY USING THIS SCRIPT YOU AGREE TO THESE TERMS/CONDITIONS\n\n";


var helptext = "node LangParserTranslator --job=parseonly/DEEPLCOSTSMONEY --source=en --target=de (fr, es, etc OR: all for all languages!!)"
+"\n--job=parseonly: will only parse your HTML files and put them into the JSON of the source language. Ignores the --target"
+"\n--job=DEEPLCOSTSMONEY: will parse AND translate with deepl - this costs money through your deepl API! We don't guarantee that this script works!!"

console.log(disclaimer);

if(args.job != "parseonly" && args.job != "DEEPLCOSTSMONEY" ){
    console.log("Start this program with arguments:  \n\n" + helptext);
    process.exit(1);
}

console.log('BEFORE READ ALL');

/*
    1. step: Get the default language into memory from the HTML files
*/
let langSource
if (args.source && args.target) {
    langSource = args.source
    jsonLangFromParsed[args.source] = parseHtmlFiles();
} else {
    langSource = settings.defaultLanguage
    jsonLangFromParsed[settings.defaultLanguage] = parseHtmlFiles();
}



/*
*   2. step: If the default language JSON language file does not exist, create it now, ELSE load it
*/

var jsonLangFile = {};
jsonLangFile["default"] = getJsonFilename(langSource);
jsonLangFile[langSource] = jsonLangFile["default"];

console.log('E X S I S T :', jsonLangFile["default"]);

if (!fs.existsSync(jsonLangFile["default"])) {
    jsonLangFromParsed[langSource]["___version"] = 1;
    fs.writeFileSync(jsonLangFile["default"], 
        stringifyLang(langSource, jsonLangFromParsed[langSource]),
        function(err) {
            if (err) {
                return console.log("Error in step 2: " + err);
            }
        });
    console.log("Wrote the default language JSON file!");    
}

var temp = fs.readFileSync(jsonLangFile["default"], 'utf8');
jsonLangFromLoadedFile[langSource] = temp.toString().replace("EasyRadiology_Language[\"" + langSource + "\"] = ", "");

console.log('JSOON: ', jsonLangFromLoadedFile[langSource]);


/*
*   3. step: If translate is enabled, also load all languages and create the jsonLangFromParsed[curLang] object and fill it, if js file present
*/
console.log('BEFORE READ ALL');
if(args.job == "DEEPLCOSTSMONEY" && !args.source && !args.target){
    readAllJsonFiles(1);

} else if (args.job == "DEEPLCOSTSMONEY" && args.source && args.target) {
    readAllJsonFiles(0);
}
console.log('AFTER READ ALL');
/*
*   4. step: Get changes. If none, exit. Else either just parse newly or 
        translate
*/

trackChanges();
if (changes.length > 0 ) {
    curVersion = parseInt(jsonLangFromLoadedFile[langSource]["___version"]);
    newVersion = curVersion++;
    jsonLangFromParsed[langSource]["___version"] = newVersion;

    // Write the default language file, if there are changes
    fs.writeFileSync(jsonLangFile["default"],
    stringifyLang(langSource, jsonLangFromParsed[langSource]),
    function(err) {

        if (err) {
            return console.log("\nWrite error in step 4: " + err);
        }
    });

    console.log("\nParsing finished. A new default language file (language: " + langSource + " was written!");
   
}

// if(args.job == "DEEPLCOSTSMONEY"){
//     translateToAllLanguages();
// }
if(args.job == "DEEPLCOSTSMONEY" && !args.source && !args.target){
    translateToAllLanguages(1);

} else if (args.job == "DEEPLCOSTSMONEY" && args.source && args.target) {
    translateToAllLanguages(0);
}
else if(changes.length == 0){
    console.log("\nNothing to do, the texts in the existing JSON file is the same as the HTML files");
    process.exit(0);
}

function readAllJsonFiles(mode){
    let translateToLang
    if(mode) {
        translateToLang = settings.translateTo;
    } else {
        translateToLang = Array.isArray(args.target) ? args.target : (args.target ? args.target.split(',').map(lang => lang.trim()) : []);
    }
    //Cycle through all languages
    for (var i = 0; i < translateToLang.length; i++) {

        var curLang = translateToLang[i];
        if(!settings.availableLanguages.includes(curLang)){
            continue;
        }
        jsonLangFromLoadedFile[curLang] = {};
        var pathToLangFile = getJsonFilename(args.source);
        console.log('FILE EXIST', pathToLangFile)
        if (fs.existsSync(pathToLangFile)) { //If it exists, load it
            try{
                var json = fs.readFileSync(pathToLangFile, 'utf8');
            }
            catch (e){
                console.log("\nThe file " + pathToLangFile + " could not be opened. Maybe it is opened somewhere else?");
                console.log(e);
                process.exit(1);
            }
            json = json.toString();
            json = json.replace("EasyRadiology_Language[\"" + curLang + "\"] = ", "");
            try{
                jsonLangFromLoadedFile[curLang] = JSON.parse(json);
            }
            catch(e){
                console.log("File " + pathToLangFile + " could not be parsed to Json. Please check file or delete");

            }
            jsonLangFromParsed[curLang] = jsonLangFromLoadedFile[curLang]; // Put all input already into the output
        }
        else{
            jsonLangFromParsed[curLang] = {};

        }
    }
}

async function translateToAllLanguages(mode) {
    console.log('RUNNED IN MODE: ', mode);
    let translateFromLang
    let translateToLang
    if(mode) {
        translateToLang = settings.translateTo;
        translateFromLang = settings.defaultLanguage;
    } else {
        translateToLang = Array.isArray(args.target) ? args.target : (args.target ? args.target.split(',').map(lang => lang.trim()) : []);
        translateFromLang = args.source;
    }
    console.log('FROM AND TO: ', translateFromLang, translateToLang);
    // Cycle through all languages
    for (var i = 0; i < translateToLang.length; i++) {
        var translationCounter = 0;
        console.log('FROM AND TO: ', translateToLang[i], translateFromLang);
        var curLang = translateToLang[i];
        // Additional logging for debugging
        console.log('Current Language: ', curLang);
        console.log('Source Language: ', translateFromLang);
        console.log('Available Languages: ', settings.availableLanguages);
        if(curLang == translateFromLang || !settings.availableLanguages.includes(curLang)){
            continue; // Skip the default lang
        }
        console.log('GOOO', jsonLangFromParsed[curLang])
        var promises = {};
        promises[curLang] = []; 

        // Go through all keys of the default language, from the freshly parsed
        for (var key in jsonLangFromParsed[curLang]) {
            if (jsonLangFromLoadedFile[curLang] &&
                jsonLangFromLoadedFile[curLang].hasOwnProperty(key) &&
                (!changes.includes(key) || jsonLangFromLoadedFile[curLang][key].indexOf(settings.ignoreInJson) !== -1  )) { // If the other lang has also the same key as English, lets check, if anything was changed
                continue; // Nothing to translate
            }
            console.log('RUNNED IN MODE:2 ', jsonLangFromParsed[curLang][key]);
            translationCounter++;
            // Push that in the "TODO array"
            promises[curLang].push(translateText(key, jsonLangFromParsed[curLang][key], curLang));
            
        }


        // Send off all the texts to be translated and write the language file
        try{
            console.log('Its moving on', promises[curLang])
            if(promises[curLang].length > 0){
                var res = await Promise.all(promises[curLang])
                jsonLangFromParsed[curLang]["___version"] = newVersion; 
                var counter = 0;   
                for (var key in jsonLangFromParsed[curLang]) {
                    if (jsonLangFromLoadedFile[curLang].hasOwnProperty(key) && !changes.includes(key) || key=="___version") { // If the other lang has also the same key as English, lets check, if anything was changed
                        continue; // Nothing to translate
                    }
                    if(!counter in res || res[counter] == "undefined"){
                        report += "\nError in Key: \"" + key + "\" - " + translateFromLang + ": " + jsonLangFromParsed[curLang][key] 
                        + curLang; 
                        continue;
        
                    } else if (counter >= res.length || !res[counter]) {
                        console.log("Error: No response for key: " + key + " in language: " + curLang);
                        continue;
                    }
        
        
                    if (!res[counter] || !res[counter].data || !res[counter].data.translations || res[counter].data.translations.length === 0) {
                        console.log("\nNo valid translation data for key: " + key + " in language: " + curLang);
                        continue;
                    }
                    
        
                    report += "\nKey: \"" + key + "\" - " + translateFromLang + ": " + jsonLangFromParsed[curLang][key] 
                    + " / " + curLang + ": " + res[counter]["data"]["translations"][0]["text"]; 
        
                    jsonLangFromParsed[curLang][key] = res[counter]["data"]["translations"][0]["text"]; 
                    counter++;              
                }
                console.log("Translating " + curLang + " finished with " + translationCounter.toString() + " translated texts.\n");
                //res[0]["data"]["translations"][0]["text"]
        
                fs.writeFileSync(getJsonFilename(curLang),
                stringifyLang(curLang, jsonLangFromParsed[curLang]),
                
                        function(err) {
        
                            if (err) {
                                return console.log("Error in translateAllLanguages: " + err);
                            }
                        });
            }
            else{
                console.log("Nothing to tranlate for language: " + curLang);
            }
                        
            }
            catch(e){
                console.log(e);
            }
            
    
        
     } 

     // Write a report file

     fs.writeFileSync(settings.commonPathOfJsonFiles + "report.txt",
     report,
     
             function(err) {

                 if (err) {
                     return console.log("Error in translateAllLanguages: " + err);
                 }
             });
}


async function translateText(key, text, targetLanguage)
{
    let langFrom
    if(args.source) {
        langFrom = args.source
    } else {
        langFrom = settings.defaultLanguage
    }
    if(key ==="___version" || (typeof text !== 'string')){
        return;
    }

    if(text.trim() == "" || text == "undefined"){
        return false;
    }
    var obj = {
        "target_lang" : targetLanguage.toUpperCase(),
        "source_lang" : langFrom.toUpperCase(),
        "text" : text
    }
    
    return deepl.translate(obj);
}

function getJsonFilename(language){
    return settings.commonPathOfJsonFiles + settings.jsonFilePrefix + "_" + language + ".js";
}

function stringifyLang(language, obj){
    return "EasyRadiology_Language[\"" + language +"\"] = " + JSON.stringify(obj, null, 1);
}


/*
 * Parses the HTML files and compares to the JSON lang file, if there are changes
 *
 *
 */
function trackChanges() {
    let langFrom
    if(args.source) {
        langFrom = args.source
    } else {
        langFrom = settings.defaultLanguage
    }
    enJson = jsonLangFromLoadedFile[langFrom].replace("EasyRadiology_Language[\"en\"] = ", "");
    try{
        var def = JSON.parse(enJson);
    }
    catch(e){
        console.log("\nThe default English JSON file was loaded, but the content cannot be converted to JSON. Please check the file and in doubt, delete it!");
        console.log(e);
        process.exit(1);
    }
    for (var key in jsonLangFromParsed[langFrom]) {
        if (def.hasOwnProperty(key)) {
            console.log("Changes hasOwnProperty: " + key);
            if (jsonLangFromParsed[langFrom][key] === def[key] || key == "___version") {
                continue;
            }

        }
        changes.push(key);
    }
    console.log("From last version, " + changes.length + " change(s) was/were performed");
    console.log("Changes are: " + changes);
}


/*
 * Parses all HTML files into the English JSON in memory (not yet saving)
 *
 */

function parseHtmlFiles() {
    console.log('PARSER', args.html);
    var langObj = {};
    for (var i = 0; i < settings.htmlWithLang.length; i++) {

        var temp
        if (args.html) {
            temp = parseArgFile('/app/temp_html.html');
        } else {
            temp = parseFile(settings.commonPathOfHtmlFiles + settings.htmlWithLang[i]);
        }
         
        for (var key in temp){
            langObj[key] = temp[key];
        }
    }
    return langObj;
}

/*
 * Takes HTML files in English and creates an English json file
 */

function parseFile(file) {
    var toLangObj = {};
    var file2 = fs.readFileSync(file, 'utf8');
    //console.log(file);
    var $ = cheerio.load(file2);
    $("[" + settings.langAttribute + "]").each(function (i, elem) {
        var langItem = $(this).html();
        langItem = langItem.replace(/^[\s]{2,}|[\s]{2,}$/gm, " "); // Replace multiple spaces with 1 space
        langItem = langItem.replace(/(?:\r\n|\r|\n|\t)/gm, ''); //Replace line breaks or tabs of the HTML code with nothing
        
        langItem = entities.decode(langItem);

        toLangObj[$(this).attr(settings.langAttribute)] = langItem; 

    });

    return toLangObj;
}

function parseArgFile(Content) {
    var toLangObj = {};

    fileContent = fs.readFileSync(Content, 'utf8');  // fileOrContent is HTML content passed as a string

    var $ = cheerio.load(fileContent);
    
    // Parse HTML elements with the specified lang attribute
    $("[" + settings.langAttribute + "]").each(function (i, elem) {
        var langItem = $(this).html();
        langItem = langItem.replace(/^[\s]{2,}|[\s]{2,}$/gm, " "); // Replace multiple spaces with 1 space
        langItem = langItem.replace(/(?:\r\n|\r|\n|\t)/gm, ''); // Replace line breaks or tabs of the HTML code with nothing
        
        langItem = entities.decode(langItem);

        toLangObj[$(this).attr(settings.langAttribute)] = langItem;
    });

    return toLangObj;
}



