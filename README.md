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

Please check the settings below for more details on how you can change the behaviour of this extension like which work item types or how many of them are shown, which branch name is suggested when creating a new branch and further things.

## Extension Settings

This extension contributes the following settings:

* `azdevops-vscode-simplify.showWorkItemTypes`: Show all work items with one of the following types. If it's empty, we're trying to figure out the relevant work items on our own based on your Project confiugrations in Azure DevOps.
* `azdevops-vscode-simplify.hideWorkItemsWithState`: Use this setting to define which work items should be hidden. By default closed and removed ones are not shown.
* `azdevops-vscode-simplify.sortOrderOfWorkItemState`: Work items are sorted by state, then by name. With this setting you're able to change the order of the states or add your own custom ones.
* `azdevops-vscode-simplify.maxNumberOfWorkItems`: Use this setting to define the maximum number of work items that are shown below a query (default: 25).
* `azdevops-vscode-simplify.useWorkitemIdInBranchName`: Use the work item id in the branch name proposal when you create a new branch

Furthermore we use the following settings from other extensions:

* `git.branchPrefix`: When creating a new branch we are asking you for a branch name. This prefix, together with the `useWorkitemIdInBranchName` setting will alredy be suggested as branch name.

## Known Issues

No features, no issues...

## Authors

This extenion is co-authored by [David Feldhoff](https://twitter.com/feldhoffdavid) and [Tobias Fenster](https://tobiasfenster.io)