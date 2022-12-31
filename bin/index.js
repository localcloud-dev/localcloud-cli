#! /usr/bin/env node
const yargs = require("yargs");
const chalk = require('chalk');
const inquirer = require("inquirer");
const decompress = require('decompress');
const decompressTargz = require('decompress-targz');
const request = require('superagent');
const homedir = require('os').homedir();
const platform = require('os').platform();
const fs = require('fs');
const exec = require('child_process').exec;
const { spawn } = require('child_process');

const url = require('node:url');

const usage = chalk.hex('#001219')(`
To deploy the first project your local machine should join VPN.
Run the command below to join:

    deploy --join invite_link

where invite_link is URL that you can request on a root service-node.

More details at deployed.cc/docs
`);

const root_node_static_ip = "192.168.202.1";


const isRunning = (query, cb) => {
    let platform = process.platform;
    let cmd = '';
    switch (platform) {
        case 'win32': cmd = `tasklist`; break;
        case 'darwin': cmd = `ps -ax`; break;
        case 'linux': cmd = `ps -A`; break;
        default: break;
    }
    exec(cmd, (err, stdout, stderr) => {
        cb(stdout.toLowerCase().indexOf(query.toLowerCase()) > -1);
    });
}


yargs
    .usage(usage)
    .option("j", {
        alias: "join", describe: "Join a VPN", type: "string", demandOption
            : false
    })
    .command('start', 'Connect an agent to VPN')
    .help(true)
    .argv;


//Parse params
var invite_link = yargs.argv.join;
if (invite_link == undefined) {
    invite_link = yargs.argv.j;
}

if (invite_link == undefined || invite_link == '') {
    //Check if we already have local Nebula config
    if (check_nebula_certificates() == true) {
        isRunning('nebula', (status) => {
            if (status === true) {
                show_main_menu();
            } else {
                start_nebula();
            }
        })
    } else {
        console.log(usage);
        return;
    }
} else {
    download_vpn_certificates();
}

function download_vpn_certificates() {
    //Check if join_link is a valid URL
    try {
        url.parse(invite_link);
    } catch (error) {
        console.log(`\n"${invite_link}" isn't a valid URL. ${error}`);
        console.log(usage);
        return;
    }

    var nebula_download_url = '';
    var nebula_archive = ``
    var plugins = null;

    //Download ZIP with files to connect to VPN
    const zip_file = `${homedir}/deployed-join-vpn.zip`
    request
        .get(invite_link)
        .on('error', function (error) {
            console.log(error);
            console.log("Looks like the server hasn't received a TLS certificate yet. Let's try again after 10 seconds ...")
            setTimeout(function() {
                download_vpn_certificates();
            }, 10000);
        })
        .pipe(fs.createWriteStream(zip_file))
        .on('finish', function () {
            exec(`chmod +x ${zip_file}`, {
                cwd: homedir
            }, function (err, stdout, stderr) {
                //Extract zip to ~/.deployed
                //var zip = new adm_zip(zip_file);
                //zip.extractAllTo(`${homedir}/.deployed`,true);

                decompress(zip_file, `${homedir}/.deployed`).then(files => {
                    //Download Nebula
                    switch (platform) {
                        case 'darwin':
                            nebula_download_url = `https://github.com/slackhq/nebula/releases/download/v1.6.1/nebula-darwin.zip`;
                            nebula_archive = `${homedir}/nebula.zip`;
                            break;
                        case 'linux':
                            nebula_download_url = `https://github.com/slackhq/nebula/releases/download/v1.6.1/nebula-linux-amd64.tar.gz`;
                            nebula_archive = `${homedir}/nebula.tar.gz`;
                            plugins = { plugins: [decompressTargz()] };
                            break;
                        case 'freebsd':
                            nebula_download_url = `https://github.com/slackhq/nebula/releases/download/v1.6.1/nebula-freebsd-amd64.tar.gz`;
                            nebula_archive = `${homedir}/nebula.tar.gz`;
                            plugins = { plugins: [decompressTargz()] };
                            break;
                    }

                    if (nebula_download_url != '') {
                        request
                            .get(nebula_download_url)
                            .on('error', function (error) {
                                console.log(error);
                            })
                            .pipe(fs.createWriteStream(nebula_archive))
                            .on('finish', function () {
                                //Extract zip to ~/.deployed
                                //var zip = new adm_zip(nebula_archive);
                                //zip.extractAllTo(`${homedir}/.deployed`, /*overwrite*/ true);

                                decompress(nebula_archive, `${homedir}/.deployed`, plugins).then(files => {
                                    start_nebula();
                                });

                            });
                    }

                });

            });
        });
}

function check_nebula_certificates() {
    if (fs.existsSync(`${homedir}/.deployed/ca.crt`) && fs.existsSync(`${homedir}/.deployed/config.yaml`)) {
        return true;
    }
    return false;
}

function start_nebula() {
    exec(`chmod +x ${homedir}/.deployed/nebula`, {
        cwd: homedir
    }, function (err, stdout, stderr) {

        //Start Nebula
        try {

            //Ask an admin password to start Nebula
            inquirer.prompt([
                {
                    type: 'password',
                    name: 'vpn_passwd',
                    message: 'Enter your admin password to start VPN agent (check docs at deployed.cc/docs/vpn if you want to know more details)'
                }
            ]).then((answers) => {

                console.log("\nStarting a VPN agent...\n");

                const nebula_process = spawn(`echo "${answers.vpn_passwd}" | sudo -S ls && sudo ${homedir}/.deployed/./nebula`, [`-config`, `config.yaml`], {
                    detached: false,
                    cwd: `${homedir}/.deployed`,
                    shell: true
                });

                nebula_process.stdout.on('data', function (data) {
                    //console.log(data.toString());
                    //Avoid showing a command in 'ps -ax'
                    exec(`kill $(ps aux | grep 'echo "${answers.vpn_passwd}"' | awk '{print $2}')`, (err, stdout, stderr) => {
                    });
                });
                nebula_process.stderr.on('data', function (data) {
                    //console.log(data.toString());
                });

                nebula_process.on('exit', function (code, signal) {
                    //console.log('child process exited with ' +
                    //`code ${code} and signal ${signal}`);
                });
                //nebula_process.unref();

                show_main_menu();

            }).catch((error) => {

            });

        } catch (error) {
            console.log(error);
        }

    });
}

function show_main_menu() {
    const main_menu_choices = [
        'Deploy service',
        'Manage services'
    ];

    inquirer.prompt([
        {
            type: 'list',
            name: 'main_menu',
            message: 'What do you want to do? (CTRL + C to close this app)',
            choices: main_menu_choices
        }
    ]).then((answers) => {
        if (answers.main_menu === main_menu_choices[0]) {
            add_service();
        } else if (answers.main_menu === main_menu_choices[1]) {
            list_services();
        }
    }).catch((error) => {
        if (error.isTtyError) {
            // Prompt couldn't be rendered in the current environment
        } else {
            // Something else went wrong
        }
    });
}

function add_service() {
    //Get deployment credentials from a root node
    var git_url = '';
    var branch = '';
    var port = '';
    var domain = '';

    request
        .get(`http://${root_node_static_ip}:5005/deploy/credentials`)
        .set('accept', 'json')
        .end((err, credentials) => {

            console.log(`\nEnter Git clone URL. Use https:// for public repositories and git@ for private repositories.\nExamples:\n - public repository: https://github.com/ladjs/superagent.git\n - private repository: git@bitbucket.org:deployed/service-node.git\n`);

            //Ask a service name
            inquirer.prompt([
                {
                    type: 'input',
                    name: 'git_url',
                    message: 'Git clone URL:\n'
                }
            ]).then((answers) => {

                git_url = answers.git_url;

                inquirer.prompt([
                    {
                        type: 'input',
                        name: 'branch_name',
                        message: 'Enter a branch name (for example: master or main):\n'
                    }
                ]).then((answers) => {

                    branch = answers.branch_name;

                    inquirer.prompt([
                        {
                            type: 'input',
                            name: 'port',
                            message: 'Enter a port your service listens to (for example: 4008):\n'
                        }
                    ]).then((answers) => {

                        port = answers.port;

                        inquirer.prompt([
                            {
                                type: 'input',
                                name: 'domain',
                                message: 'Enter a domain:\n'
                            }
                        ]).then((answers) => {

                            domain = answers.domain;

                            const ssh_pub_key = chalk.hex('#127475')(`${credentials.body.ssh_pub_key}`);
                            const webhook_url = chalk.hex('#127475')(`${credentials.body.webhook_url}`);
                            const hint = chalk.hex('#000')(`
To deploy a new service/app, add a public key of the server and webhook URL listed below to the Git repository Access Keys and Webhooks. Check docs at deployed.cc/docs/connect_repo if you don't know how to do this.
        
Public Key:
        
    ${ssh_pub_key}

Webhook URL:
        
    ${webhook_url}
        
`);

                            console.log(hint);

                            inquirer.prompt([
                                {
                                    type: 'confirm',
                                    name: 'ready_deploy',
                                    message: 'Have you added a public key and webhook URL above?\n',
                                    default: true
                                }
                            ]).then((answers) => {

                                request
                                .post(`http://${root_node_static_ip}:5005/service`)
                                .send({ git_url: git_url, environments: [{"name":branch,"branch":branch,"domain":domain,"port":port}] }) // sends a JSON post body
                                .set('accept', 'json')
                                .end(function (err, res) {
                                    // Calling the end function will send the request
                                    console.log(`\nThe service should be available at ${domain} within 30 seconds. Each time you push to master the service will be updated automatically.\n`);
                                    show_main_menu();
                                });

                            }).catch((error) => {
                            });

                        }).catch((error) => {
                        });


                    }).catch((error) => {
                    });
                }).catch((error) => {
                });
            }).catch((error) => {
            });

        });
}

function list_services() {
    request
        .get(`http://${root_node_static_ip}:5005/service`)
        .set('accept', 'json')
        .end((err, service_list) => {

        var service_names = [];
        service_list.body.forEach((service, index) => {
            service_names.push(service.name);
        })
        inquirer.prompt([
            {
                type: 'list',
                name: 'service_list',
                message: 'Select service',
                choices: service_names
            }
        ]).then((answers) => {
            console.log('Selected service: ' + answers.service_list);
        }).catch((error) => {
            if (error.isTtyError) {
                // Prompt couldn't be rendered in the current environment
            } else {
                // Something else went wrong
            }
        });
        }).catch((error) => {
        });
}