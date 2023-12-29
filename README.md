# Jira Automation

A lot of value lies in a well structured history of your team's Jira issues.

Assuming going concern of the way the team works (major assumption obviously), we can use this data as a basis for how future work will go.

Not all Jira projects are well organised, so this bunch of scripts helps organise things.

I've created custom fields for my tickets, called start date and due date, and I want those to be populated with when a completed issue started, and was marked as done. These new fields will serve both as a record for past tasks, and a prediction for future tasks when we get there.

These will prove useful to me later, as I start recording duration of issues in business days.

## Using Jira's automation feature

The automation feature in Jira is pretty nifty, allows you to easily respond to changes and take action.

This can help me populate some of these fields going forward, but not historically.

I've exported all of the most useful rules I've created into the [jira-automation-rules](./jira-automation-rules) folder.

## Scripting

For pre-existing issues, this information exists in the history.

The script [apply_start_and_end_dates.js](./apply_start_and_end_dates.js) will look through the history to find the start date and due date for an issue, using it'sn history, and add it to this new field.

I find the timeline view to be an incredibly useful tool for visually viewing our plan, and whether or not we can meet a certain deadline. However, in this timeline view, issues seem to be ordered  based on their creation date, and then manually ordered, so we can rearrange them, but any epic with more than a few issues, and this manual process will become extremely tedious, especially if you have many epics.

The script [order_items_in_timeline.js](./order_items_in_timeline.js) sorts issues in an epic into a reasonable order on the timeline view, based on their start/due date and status.

### Setup
You'll need some environment variables set, I've stored mine in a file called [env.sh](./env.sh), so I can easily set them in a new terminal window.

It looks like this:

```bash
export JIRA_USERNAME="<firstname>.<lastname>@<domain>.co.uk"
export API_KEY="ATA...25E"
export SESSION_TOKEN="eyJ...YifQ.eyJh...wIn0.f5A...XXA"
# get this from network tab in browser, look for a Cookie sent like tenant.session.token

# don't think all of these actually matter, but I removed them anyway
export JIRA_SEC_CSRF="Pg...Kl"
export JIRA_USER_ID="634...e6c"
export JIRA_OPTIMIZELY_END_USER_ID="oe...46"
export JIRA_ALGOLIA="anonymous-d3...c4"
export JIRA_XSRF_TOKEN="f1...6c"
export JIRA_AWC_TLD_TEST="xxxxxx"
export JIRA_AJS_ANONYMOUS_ID="%220...4%22"
export JIRA_JSESSIONID="3EC...2F5"
export JIRA_ATL_XID_XC="%7B%22...2%7D"
export JIRA_ATL_USER_HASH="13...48"
```

The API token is long lived, but the session token is short lived, and is required for using Jira's graphQL API, which is required to re-order items on the roadmap.

You can fetch it from your browser's network tab, along with all this other stuff, but I don't know if the rest is strictly necessary
