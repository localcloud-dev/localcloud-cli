#! /usr/bin/env node
const chalk = require('chalk');
const inquirer = require("inquirer");
const request = require('superagent');
const homedir = require('os').homedir();
const exec = require('child_process').exec;
const is_valid_hostname = require('../utils/utils');

const root_node_static_ip = "192.168.202.1";
const main_menu_item = "← Main Menu";
const new_environment_item = "+ New Environment";

const new_tunnel_item = "+ New Tunnel";
const new_server_item = "+ Server (where you host web services and apps; Ubuntu 22.04 LTS is required)";
const new_local_machine_item = "+ Local Machine (laptops, desktop computers; Linux or macOS is required)";

show_main_menu();

function show_main_menu() {
    const main_menu_choices = [
        'New Service/App',
        'Services/Apps',
        'Servers/Local Machines',
        'Localhost Tunnels'
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
        } else if (answers.main_menu === main_menu_choices[2]) {
            list_servers_local_machines();
        } else if (answers.main_menu === main_menu_choices[3]) {
            show_tunnels();
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

            console.log(`\nEnter Git clone URL. Use https:// for public repositories and git@ for private repositories.\nExamples:\n - public repository: https://github.com/ladjs/superagent.git\n - private repository: git@bitbucket.org:user/service-node.git\n`);

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
                                message: 'Enter a domain (example: project.domain.com, you should add A record to DNS before deploying - check localcloud.dev/docs/custom_domains):\n'
                            }
                        ]).then((answers) => {

                            domain = answers.domain;

                            //Select servers to deploy
                            request
                                .get(`http://${root_node_static_ip}:5005/vpn_node`)
                                .set('accept', 'json')
                                .end((err, servers_list) => {
                                    const servers = servers_list.body;
                                    var server_names = [];
                                    servers.forEach((server, index) => {
                                        server_names.push(`• ${server.name}: ${server.ip} : ${JSON.parse(server.type).join(', ')}`);
                                    })
                                    console.log("");
                                    inquirer.prompt([
                                        {
                                            type: 'list',
                                            name: 'selected_server',
                                            message: 'Select a server where to deploy a service/app',
                                            choices: server_names
                                        }
                                    ]).then((answers) => {
                                        let index = server_names.indexOf(answers.selected_server);

                                        const server_id = servers[index].id;
                                        const ssh_pub_key = chalk.hex('#127475')(`${credentials.body.ssh_pub_key}`);
                                        const webhook_url = chalk.hex('#127475')(`${credentials.body.webhook_url}`);
                                        const hint = `
To deploy a new service/app, add a public key of the server and webhook URL listed below to the Git repository Access Keys (Bitbucket) / Deploy Keys (GitHub) and Webhooks. Check docs at localcloud.dev/docs if you don't know how to do this.
        
Public Key:
        
    ${ssh_pub_key}

Webhook URL:
        
    ${webhook_url}
        
`;

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
                                                .send({ git_url: git_url, environments: [{ "name": branch, "branch": branch, "domain": domain, "port": port, "servers": [{ "id": server_id, "status": "to_deploy" }], "image_id": "" }] }) // sends a JSON post body
                                                .set('accept', 'json')
                                                .end(function (err, res) {
                                                    // Calling the end function will send the request
                                                    console.log(`\nThe service should be available at ${domain} within 30 seconds. Each time you push to master the service will be updated automatically.\n`);
                                                    show_main_menu();
                                                });

                                        }).catch((error) => {
                                        });

                                    }).catch((error) => {
                                        if (error.isTtyError) {
                                            // Prompt couldn't be rendered in the current environment
                                        } else {
                                            // Something else went wrong
                                        }
                                    });
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

            const services = service_list.body;
            var service_names = [];
            services.forEach((service, index) => {
                service_names.push(service.name);
            })
            service_names.push(new inquirer.Separator());
            service_names.push(main_menu_item);

            console.log("");
            inquirer.prompt([
                {
                    type: 'list',
                    name: 'selected_service',
                    message: 'Select service',
                    choices: service_names
                }
            ]).then((answers) => {
                if (answers.selected_service === main_menu_item) {
                    show_main_menu();
                } else {
                    let selected_service = services.find(service => service.name === answers.selected_service);
                    show_service_menu(selected_service);
                }

            }).catch((error) => {
                if (error.isTtyError) {
                    // Prompt couldn't be rendered in the current environment
                } else {
                    // Something else went wrong
                }
            });
        })
}

function show_service_menu(service) {
    console.log("");
    var service_menu = ["View Environments", "Delete Service"];
    service_menu.push(new inquirer.Separator());
    service_menu.push(main_menu_item);
    inquirer.prompt([
        {
            type: 'list',
            name: 'service_menu',
            message: `Selected service: ${service.name}\n Git: ${service.git_url}\n Environments: ${service.environments.length}`,
            choices: service_menu
        }
    ]).then((answers) => {

        if (answers.service_menu === main_menu_item) {
            show_main_menu();
        } else if (answers.service_menu === service_menu[0]) {
            show_environments(service);
        } else if (answers.service_menu === service_menu[1]) {
            show_delete_confirmation(service);
        }

    }).catch((error) => {
        if (error.isTtyError) {
            // Prompt couldn't be rendered in the current environment
        } else {
            // Something else went wrong
        }
    });

}

function show_delete_confirmation(service) {
    console.log("");
    inquirer.prompt([
        {
            type: 'confirm',
            name: 'delete_confirmation',
            message: `Do you really want to delete "${service.name} service"?\n`,
            default: false
        }
    ]).then((answers) => {

        if (answers.delete_confirmation) {
            request
                .delete(`http://${root_node_static_ip}:5005/service/${service.id}`)
                .set('accept', 'json')
                .end((err, result) => {
                    if (err != null && result.body.msg != undefined) {
                        console.log(result.body.msg);
                    } else {
                        console.log(`Service ${service.name} has been deleted`);
                        show_main_menu();
                    }
                });
        }

    }).catch((error) => {
    });
}

function show_environments(service) {
    console.log("");
    request
        .get(`http://${root_node_static_ip}:5005/service/${service.id}`)
        .set('accept', 'json')
        .end((err, environments_response) => {

            const environments = environments_response.body.environments;

            var environment_names = [];
            environment_names.push(new_environment_item);
            environment_names.push(new inquirer.Separator());
            environments.forEach((environment, index) => {
                environment_names.push(environment.name);
            })
            environment_names.push(new inquirer.Separator());
            environment_names.push(main_menu_item);
            console.log("");
            inquirer.prompt([
                {
                    type: 'list',
                    name: 'selected_environment',
                    message: 'Select or Add Environment',
                    choices: environment_names
                }
            ]).then((answers) => {
                if (answers.selected_environment === main_menu_item) {
                    show_main_menu();
                } else if (answers.selected_environment === new_environment_item) {
                    show_new_environment(service);
                } else {
                    let selected_environment = environments.find(environment => environment.name === answers.selected_environment);
                    show_environment_menu(selected_environment, service);
                }
            }).catch((error) => {
                if (error.isTtyError) {
                    // Prompt couldn't be rendered in the current environment
                } else {
                    // Something else went wrong
                }
            });
        })
}

function show_environment_menu(environment, service) {
    console.log("");
    var environment_menu = ["Delete Environment"];
    environment_menu.push(new inquirer.Separator());
    environment_menu.push(main_menu_item);
    inquirer.prompt([
        {
            type: 'list',
            name: 'environment_menu',
            message: `What do you want to do with "${environment.name}" environment in "${service.name}" service?\nEnvironment URL: https://${environment.domain}\nGit branch:  ${environment.branch}\nPort: ${environment.port}`,
            choices: environment_menu
        }
    ]).then((answers) => {

        if (answers.environment_menu === main_menu_item) {
            show_main_menu();
        } else if (answers.environment_menu === environment_menu[0]) {
            show_delete_environment_confirmation(environment, service);
        }

    }).catch((error) => {
        if (error.isTtyError) {
            // Prompt couldn't be rendered in the current environment
        } else {
            // Something else went wrong
        }
    });

}

function show_new_environment(service) {

    var environment_name = '';
    var environment_branch = '';
    var environment_port = '';
    var environment_domain = '';

    //Ask a branch name
    inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Enter name:\n'
        }
    ]).then((answers) => {
        environment_name = answers.name;

        //Ask a branch name
        inquirer.prompt([
            {
                type: 'input',
                name: 'branch',
                message: 'Enter git branch:\n'
            }
        ]).then((answers) => {
            environment_branch = answers.branch;

            //Ask a port
            inquirer.prompt([
                {
                    type: 'input',
                    name: 'port',
                    message: 'Enter service/app port:\n'
                }
            ]).then((answers) => {
                environment_port = answers.port;

                //Ask a service name
                inquirer.prompt([
                    {
                        type: 'input',
                        name: 'domain',
                        message: 'Enter a domain (example: project.domain.com, you should add A record to DNS before deploying - check localcloud.dev/docs):\n'
                    }
                ]).then((answers) => {
                    environment_domain = answers.domain;

                    var new_environment = {};
                    new_environment.name = environment_name;
                    new_environment.branch = environment_branch;
                    new_environment.port = environment_port;
                    new_environment.domain = environment_domain;


                    //Select servers to deploy
                    request
                        .get(`http://${root_node_static_ip}:5005/vpn_node`)
                        .set('accept', 'json')
                        .end((err, servers_list) => {
                            const servers = servers_list.body;
                            var server_names = [];
                            servers.forEach((server, index) => {
                                server_names.push(`• ${server.name}: ${server.ip} : ${JSON.parse(server.type).join(', ')}`);
                            })
                            console.log("");
                            inquirer.prompt([
                                {
                                    type: 'list',
                                    name: 'selected_server',
                                    message: 'Select a server where to deploy a service/app',
                                    choices: server_names
                                }
                            ]).then((answers) => {
                                let index = server_names.indexOf(answers.selected_server);

                                const server_id = servers[index].id;
                                new_environment.servers = [{ "id": server_id, "status": "to_deploy" }];

                                //Send a request to create a new environment
                                request
                                    .post(`http://${root_node_static_ip}:5005/environment/${service.id}`)
                                    .send(new_environment)
                                    .set('accept', 'json')
                                    .end((err, result) => {
                                        if (err != null) {
                                            console.log(result.body.msg);
                                            show_environments(service);
                                        } else {
                                            console.log(`"${environment_name}" environment in "${service.name}" service has been created and will be accessible at https://${environment_domain} shortly.`);
                                            show_environments(service);
                                        }
                                    });



                            }).catch((error) => {
                            });

                        });


                }).catch((error) => {
                });

            }).catch((error) => {
            });

        }).catch((error) => {
        });
    }).catch((error) => {
    });

}

function show_delete_environment_confirmation(environment, service) {
    console.log("");
    inquirer.prompt([
        {
            type: 'confirm',
            name: 'delete_environment_confirmation',
            message: `Do you really want to delete "${environment.name}" environment in "${service.name}" service?\n`,
            default: false
        }
    ]).then((answers) => {

        if (answers.delete_environment_confirmation) {
            request
                .delete(`http://${root_node_static_ip}:5005/environment/${service.id}/${environment.name}`)
                .set('accept', 'json')
                .end((err, result) => {
                    if (err != null && result.body.msg != undefined) {
                        console.log(result.body.msg);
                    } else {
                        console.log(`"${environment.name}" environment in "${service.name}" service has been deleted`);
                        show_main_menu();
                    }
                });
        }else{
            show_environment_menu(environment, service);
        }

    }).catch((error) => {
    });
}

//Servers and local machines
function list_servers_local_machines() {
    request
        .get(`http://${root_node_static_ip}:5005/vpn_node`)
        .set('accept', 'json')
        .end((err, servers_list) => {

            const servers = servers_list.body;
            var server_names = [];
            server_names.push(new_server_item);
            server_names.push(new_local_machine_item);
            server_names.push(new inquirer.Separator());
            servers.forEach((server, index) => {
                server_names.push(`• ${server.name}: ${server.ip} : ${JSON.parse(server.type).join(', ')}`);
            })
            server_names.push(new inquirer.Separator());
            server_names.push(main_menu_item);

            console.log("");
            inquirer.prompt([
                {
                    type: 'list',
                    name: 'selected_server',
                    message: 'Select server/local machine or add a new one',
                    choices: server_names
                }
            ]).then((answers) => {
                if (answers.selected_server === main_menu_item) {
                    show_main_menu();
                } else if (answers.selected_server === new_server_item) {
                    show_add_server();
                } else if (answers.selected_server === new_local_machine_item) {
                    show_add_local_machine();
                } else {
                    //let selected_machine = servers.find(server => server.name === answers.selected_server.replace('• ', ''));
                    console.log("!!!" + answers.selected_server);
                }

            }).catch((error) => {
                if (error.isTtyError) {
                    // Prompt couldn't be rendered in the current environment
                } else {
                    // Something else went wrong
                }
            });
        })
}

function show_add_server() {
    add_vpn_node("server");
}

function show_add_local_machine() {
    add_vpn_node("local_machine"); 
}

function add_vpn_node(type) {
    //Send a request to create a new environment

    //Ask a port
    inquirer.prompt([
        {
            type: 'input',
            name: 'machine_name',
            message: `Enter name (alphabetic characters (A-Z), numeric characters (0-9), the minus sign (-)):\n`
        }
    ]).then((answers) => {
        const machine_name = answers.machine_name;
        if (is_valid_hostname(machine_name) == false) {
            console.log("The name includes invalid characters. Try another name.");
            add_vpn_node(type);
            return;
        }

        request
            .post(`http://${root_node_static_ip}:5005/vpn_node`)
            .send({ name: machine_name, type: type })
            .set('accept', 'json')
            .end((err, result) => {
                if (err != null) {
                    console.log(result.body.msg);
                    list_servers_local_machines();
                } else {
                    msg = '';
                    if (type == "local_machine") {
                        msg = `\n
=^..^=   =^..^=   =^..^=    =^..^=    =^..^=    =^..^=    =^..^=\n
\nFollow steps bellow to connect a new local machine:\n
  - install LocalCloud CLI on your local machine. LocalCloud CLI works on Ubuntu and macOS, admin permissions are required to install. Run in Terminal/Console:
    
        Linux: curl https://localcloud.dev/setup/linux | sh -s join ${result.body.zip_url}
        MacOS: curl https://localcloud.dev/setup/mac | sh -s join ${result.body.zip_url}

  - to start LocalCloud CLI next time:

        localcloud

  - more information can be found at localcloud.dev/docs
`;
                    } else if (type == "server") {
                        msg = `\n
=^..^=   =^..^=   =^..^=    =^..^=    =^..^=    =^..^=    =^..^=\n
\nFollow steps bellow to connect a new server:\n
  - SSH into a server with "fresh" Ubuntu 22.04 and run a command:
    
        curl https://localcloud.dev/install | sh -s join ${result.body.zip_url}

  - more information can be found at localcloud.dev/docs

`;
                    }

                    console.log(msg);

                    //Focus a user on instructions for a few seconds
                    exec(`sleep 1`, (err, stdout, stderr) => {
                        list_servers_local_machines();
                    });

                }
            });

    }).catch((error) => {
        if (error.isTtyError) {
            // Prompt couldn't be rendered in the current environment
        } else {
            // Something else went wrong
        }
    });

}

function show_tunnels() {
    console.log("");
    request
        .get(`http://${root_node_static_ip}:5005/tunnel`)
        .set('accept', 'json')
        .end((err, tunnels_response) => {
            const tunnels = tunnels_response.body;
            var tunnel_names = [];
            tunnel_names.push(new_tunnel_item);
            tunnel_names.push(new inquirer.Separator());
            tunnels.forEach((tunnel, index) => {
                tunnel_names.push(`${tunnel.domain} -> localhost:${tunnel.port}`);
            })
            tunnel_names.push(new inquirer.Separator());
            tunnel_names.push(main_menu_item);
            console.log("");
            inquirer.prompt([
                {
                    type: 'list',
                    name: 'selected_tunnel',
                    message: 'Create a new tunnel or select a tunnel from the list below to edit/delete',
                    choices: tunnel_names
                }
            ]).then((answers) => {
                if (answers.selected_tunnel === main_menu_item) {
                    show_main_menu();
                } else if (answers.selected_tunnel === new_tunnel_item) {
                    show_new_tunnel();
                } else {
                    let selected_tunnel = tunnels.find(tunnel => `${tunnel.domain} -> localhost:${tunnel.port}` === answers.selected_tunnel);
                    show_tunnel_menu(selected_tunnel);
                }
            }).catch((error) => {
                if (error.isTtyError) {
                    // Prompt couldn't be rendered in the current environment
                } else {
                    // Something else went wrong
                }
            });
        })
}

function show_new_tunnel() {

    var tunnel_name = '';
    var tunnel_port = '';
    var tunnel_domain = '';
    var vpn_ip = '';

    //Load VPN IP from host.key
    exec(`nebula-cert print -json -path /etc/nebula/host.crt`, {
        cwd: homedir
    }, (err, stdout, stderr) => {
        if (err != null) {
            console.log(`Cannot load host VPN IP address. Error: ${err}`);
            show_main_menu();
        } else {
            if (stdout != undefined) {
                const host_details = JSON.parse(stdout);
                const ip_subnet = host_details.details.ips[0];
                vpn_ip = ip_subnet.replace("/24", "");

                //Select servers to deploy
                /*request
                .get(`http://${root_node_static_ip}:5005/vpn_node`)
                .set('accept', 'json')
                .end((err, servers_list) => {
                    const servers = servers_list.body;
                    var server_names = [];
                    servers.forEach((server, index) => {
                        server_names.push(`• ${server.name}: ${server.ip} : ${JSON.parse(server.type).join(', ')}`);
                    })

                });*/
                //Ask a port
                inquirer.prompt([
                    {
                        type: 'input',
                        name: 'port',
                        message: 'Enter local port:\n'
                    }
                ]).then((answers) => {
                    tunnel_port = answers.port;

                    //Ask a service name
                    inquirer.prompt([
                        {
                            type: 'input',
                            name: 'domain',
                            message: 'Enter a domain (example: project.domain.com, you should add A record to DNS before deploying - check localcloud.dev/docs):\n'
                        }
                    ]).then((answers) => {
                        tunnel_domain = answers.domain;

                        var new_tunnel = {};
                        new_tunnel.name = tunnel_name;
                        new_tunnel.port = tunnel_port;
                        new_tunnel.domain = tunnel_domain;
                        new_tunnel.vpn_ip = vpn_ip;

                        //Send a request to create a new environment
                        request
                            .post(`http://${root_node_static_ip}:5005/tunnel`)
                            .send(new_tunnel)
                            .set('accept', 'json')
                            .end((err, result) => {
                                if (err != null) {
                                    console.log(result.body.msg);
                                    show_tunnels();
                                } else {
                                    console.log(`A tunnel for localhost:${tunnel_port} has been created and will be accessible at https://${tunnel_domain} shortly.`);
                                    show_tunnels();
                                }
                            });

                    }).catch((error) => {
                    });

                }).catch((error) => {
                });
            }
        }
    });

}

function show_tunnel_menu(tunnel) {
    console.log("");
    var tunnel_menu = ["Delete tunnel"];
    tunnel_menu.push(new inquirer.Separator());
    tunnel_menu.push(main_menu_item);
    inquirer.prompt([
        {
            type: 'list',
            name: 'tunnel_menu',
            message: `What do you want to do with a tunnel for localhost:${tunnel.port}, a public domain: ${tunnel.domain}`,
            choices: tunnel_menu
        }
    ]).then((answers) => {

        if (answers.tunnel_menu === main_menu_item) {
            show_main_menu();
        } else if (answers.tunnel_menu === tunnel_menu[0]) {
            show_delete_tunnel_confirmation(tunnel);
        }

    }).catch((error) => {
        if (error.isTtyError) {
            // Prompt couldn't be rendered in the current environment
        } else {
            // Something else went wrong
        }
    });

}

function show_delete_tunnel_confirmation(tunnel) {
    console.log("");
    inquirer.prompt([
        {
            type: 'confirm',
            name: 'delete_tunnel_confirmation',
            message: `Do you really want to delete a tunnel for localhost:${tunnel.port}?\n`,
            default: false
        }
    ]).then((answers) => {

        if (answers.delete_tunnel_confirmation) {
            request
                .delete(`http://${root_node_static_ip}:5005/tunnel/${tunnel.id}`)
                .set('accept', 'json')
                .end((err, result) => {
                    if (err != null && result.body.msg != undefined) {
                        console.log(result.body.msg);
                    } else {
                        console.log(`The tunnel for localhost:${tunnel.port} has been deleted`);
                        show_main_menu();
                    }
                });
        }

    }).catch((error) => {
    });
}