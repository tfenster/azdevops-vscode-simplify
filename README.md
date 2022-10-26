# azdevops-vscode-simplify README

This is the README for the extension "azdevops-vscode-simplify" which aims at working with Azure DevOps from within VS Code more efficiently. 

## Features

The extension gives you a new view which shows all your Azure DevOps organizations. You can then drill down into the projects below those organizations and see five queries for work items below that:

- Assigned to me: All work items that have been assigned to you
- Followed by me: All work items that you are following
- Recent activity by me: All work items that recently have been changed by you
- Recent activity in project: All work items that have recently been changed in the project
- Recently mentioned: All work items where you have recently been mentioned

For all work items, you can add it to the commit message, create a new branch linked to it and open it in the browser.

Please note that only user stories, bugs and tasks are shown. You can also define whether closed work items should be hidden and how many work items per query are shown. See below for more details on the settings.

## Extension Settings

This extension contributes the following settings:

* `azdevops-vscode-simplify.hideClosedWorkItems`: If this is set to true, then all closed work items will be hidden (default: false).
* `azdevops-vscode-simplify.maxNumberOfWorkItems`: Use this setting to define the maximum number of work items that are shown below a query (default: 25).

## Known Issues

No features, no issues...

## Authors

This extenion is co-authored by [David Feldhoff](https://twitter.com/feldhoffdavid) and [Tobias Fenster](https://tobiasfenster.io)