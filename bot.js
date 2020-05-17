const config = require("./config.js");
const inquirer = require('inquirer');

const { IgApiClient, IgCheckpointError } = require('instagram-private-api');
const ig = new IgApiClient();

module.exports = {
  run() {
    // setup device
    //ig.state.generateDevice(config.username);
    ig.state.generateDevice(config.username + Math.random());
    
    //login
    console.log("Sedang Login...");
    
    ig.account.login(config.username, config.password)
    .then(auth => {
      console.log(auth.username);
    })
    
    .catch(err => {
      
      if (!(err instanceof IgCheckpointError)) {
        console.log(err);
      }
    
      return;
      // Checkpoint info here
      console.log("Error type:", ig.state.checkpoint.error_type);
  		
  		// Requesting sms-code or click "It was me" button
  		ig.challenge.auto(true)
  		.then(res => {
  		  
  		  return inquirer.prompt({
  		    type: "input",
  		    name: "code",
  		    message: "Enter your code:"
  		  });
  		  
  		})
  		.then(res => {
  		  
  		  console.log("Sending", res.value);
  		  return ig.challenge.sendSecurityCode(res.value);
  		
  		})
  		.then(res => {
  		  
  		  console.log("Status:", res.status);
  		  
  		});
		
    })
    
  }
};