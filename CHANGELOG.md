# Change Log

All notable changes to the "azdevops-vscode-simplify" extension will be documented in this file.

## [0.0.8]

- Add new setting `azdevops-vscode-simplify.createBranch.branchNameProposal` which enables also adding the work item description and obsolete `useWorkitemIdInBranchName` setting for it. #36

## [0.0.7]

- Ask for branch to base on when creating a new branch #28
- Add the possibility to show the parents of the Work Items as well using the setting `azdevops-vscode-simplify.showParentsOfWorkItems`. #11
- Add the possibility to select multiple Work Items when adding them to the commit message and using the command for that.
- Add setting `azdevops-vscode-simplify.organizationAndProjectFilter` to filter organizations and projects. #10
- Improve switching Azure accounts to try to fix #4

## [0.0.6]

- Fix problem where creating a branch didn't work for https-based remotes #24

## [0.0.5]

- Fix startup error if you open a folder or workspace that isn't a git repo #21
- Fix problem with hardcoded repo name #22

## [0.0.4]

- Expand the Azure DevOps project that you're currently working in after initial loading directly #2
- Show the currently used tenant and allow to easily switch it as requested in #6
- Respect the `Git: Branch prefix` setting if defined, as proposed in #7
- Introduce a configuration setting `azdevops-vscode-simplify.useWorkitemIdInBranchName` to trigger the inclusion of the work item id in the proposed branch name, as proposed in #8
- Better code when retrieving configurations
- respect settings `hideWorkItemsWithState` and `showWorkItemTypes` in quick pick view #13
- do not allow to create a new branch if the entered branch name is already in use #9

## [0.0.3]

- Stabilize login to help with the followup in #3 and the main issue in #4

## [0.0.2]

- error showed up ("Element with id 1 is already registered") when working multiple projects #3

## [0.0.1]

- Initial release