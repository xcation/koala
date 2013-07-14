/**
 * Sass compiler
 */

'use strict';

var fs          = require('fs'),
    path        = require('path'),
    exec        = require('child_process').exec,
    FileManager = global.getFileManager(),
    Compiler    = require(FileManager.appScriptsDir + '/Compiler'),
    projectDb   = require(FileManager.appScriptsDir + '/storage.js').getProjects(),
    notifier    = require(FileManager.appScriptsDir + '/notifier.js'),
    appConfig   = require(FileManager.appScriptsDir + '/appConfig.js').getAppConfig(),
    fileWatcher = require(FileManager.appScriptsDir + '/fileWatcher.js');

function SassCompiler(config) {
    Compiler.call(this, config);
}
require('util').inherits(SassCompiler, Compiler);
module.exports = SassCompiler;

/**
 * get sass command
 * @return {String}
 */
SassCompiler.prototype.getSassCmd = function () {
    if (appConfig.useSystemCommand.sass) {
        return 'sass';
    }

    if (this.sassCmd) return this.sassCmd;

    var sass = '"' + path.join(FileManager.appBinDir, 'sass') + '"',
        command = [];

    command.push('"' + FileManager.rubyExecPath + '"' + ' -S');
    command.push(sass);
    command = command.join(' ');
    this.sassCmd = command;
    return command;
}

/**
 * compile sass & scss file
 * @param  {Object} file    compile file object
 * @param  {Function} success compile success calback
 * @param  {Function} fail    compile fail callback
 */
SassCompiler.prototype.compile = function (file, success, fail) {
    var self = this,
        filePath = file.src,
        output = file.output;

    var settings = file.settings;
    for (var k in appConfig.sass) {
        if (!settings.hasOwnProperty(k)) {
            settings[k] = appConfig.sass[k];
        }
    }

    //run sass compile command
    var argv = ['"'+filePath+'"', '"'+output+'"', '--load-path', '"' + path.dirname(filePath) + '"'];

    //apply project config
    var pcfg = projectDb[file.pid].config;

    //custom options
    var customOptions = pcfg.customOptions;
    if (Array.isArray(customOptions)) {
        customOptions = customOptions.filter(function (item) {
            return /--style|--line-comments|--debug-info|--unix-newlines/.test(item) === false;
        });
        argv = argv.concat(customOptions);
    }

    //include paths
    if (Array.isArray(pcfg.includePaths)) {
        pcfg.includePaths.forEach(function (item) {
            argv.push('--load-path "' + item + '"');
        });
    }

    //require libs
    if (Array.isArray(pcfg.requireLibs)) {
        pcfg.requireLibs.forEach(function (item) {
            argv.push('--require "' + item + '"');
        });
    }

    //apply file settings
    argv.push('--style ' + settings.outputStyle);
    if (settings.lineComments) {
        argv.push('--line-comments');
    }

    if (settings.debugInfo) {
        argv.push('--debug-info');
    }

    if (settings.unixNewlines) {
        argv.push('--unix-newlines');
    }

    if (process.platform === 'win32') {
        argv.push('--cache-location "' + path.dirname(process.execPath) + '\\.sass-cache"');
    }

    var command = self.getSassCmd();
        command += ' ' + argv.join(' ');
    exec(command, {timeout: 5000}, function (error, stdout, stderr) {
        if (error !== null) {
            if (fail) fail();
            notifier.throwError(stderr, filePath);
        } else {
            if (success) success();

            //add watch import file
            var imports = self.getImports(filePath);
            fileWatcher.addImports(imports, filePath);
        }
    });
};

SassCompiler.prototype.getImports = function (srcFile) {
    //match imports from code
    var reg = /@import\s+[\"\']([^\.]+?|.+?sass|.+?scss)[\"\']/g,
        result, item, file,

        //get fullpath of imports
        dirname = path.dirname(srcFile),
        extname = path.extname(srcFile),
        fullPathImports = [],

        code = fs.readFileSync(srcFile, 'utf8');
        code = code.replace(/\/\/.+?[\r\t\n]/g, '').replace(/\/\*[\s\S]+?\*\//g, '');

    while ((result = reg.exec(code)) !== null ) {
        item = result[1];
        if (path.extname(item) !== extname) {
            item += extname;
        }

        file = path.resolve(dirname, item);

        // the '_' is omittable sass imported file
        if (path.basename(item).indexOf('_') === -1) {
            file = path.resolve(path.dirname(file), '_' + path.basename(item));
        }

        if (fs.existsSync(file)) {
            fullPathImports.push(file);
        }
    }

    return fullPathImports;
};
