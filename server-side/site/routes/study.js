var mongo = require('mongodb');
var check = require('validator').check;
var _ = require('underscore');
var fileService = require('./upload.js');

const DB = require('../db');

const ObjectID = mongo.ObjectID;
 
// let db = null;
// (async () => { db = await DB.getDB('site'); })();

exports.listing = async function(req, res)
{
    let client = await DB.getClient();
    let db = client.db('site');

    let votes = await db.collection('votes');
    let studyItems = await db.collection('studies').find().toArray();

    // console.log(studyItems);
    let cursor = await votes.aggregate(
    [
        { $group: { _id: '$studyId', votes: { $sum: 1 } } }
    ]);

    let groupResult = await cursor.toArray();
    // var util = require('util')
    // console.log(util.inspect(groupResult));


    var voteMap = new Map(groupResult.map( i => [i._id.toString(), i.votes] ));
    var result = {studies:[]};

    console.log( JSON.stringify([...voteMap]) );

    for( var s of studyItems )
    {
        if( s.skipListing ) continue;
        
        let numVotes = voteMap.get(s._id.toString()) || 0;

        var study = {
            id: s._id, 
            votes: numVotes,
            name: s.name,
            status: s.status,
            goal: s.goal,
            awards: s.awards,
            studyKind: s.studyKind,
            link: s.publicLink,
            results: s.results,
            description: s.description                                    
        };

        result["studies"].push( study );
    }

    statusPriority = 
    {
        open: 0, awarded: 1, closed: 2
    };

    result.studies.sort(function(a,b)
    {
        var aPriority = statusPriority[a.status];
        var bPriority = statusPriority[b.status];

        return aPriority - bPriority;
    });

    res.send(result);

    // close connection;
    client.close();

}

exports.loadStudy = async function(req, res) {
    var id = req.params.id;

    DB.getClient().then(function(client)
	{
		let db = client.db('site');
        console.log('Retrieving study: ' + id);
        db.collection('studies', function(err, collection) {
            collection.findOne({'_id':new ObjectID(id)}, function(err, item) {
                // don't allow token to be seen by others.
                delete item["token"];
                delete item["invitecode"];

                res.send(item);
                client.close();
            });
        });
    });
};

exports.status = function(req, res) {
    var studyId = new ObjectID(req.params.id);

	DB.getClient().then(function(client)
	{
		let db = client.db('site');
        db.collection('votes', function(err, collection) {
            collection.find({'studyId':studyId}).toArray(function(err, items) {            
                res.send({votes: items.length});
            });
        });
    });
};


exports.voteStatus = function(req, res)
{
    var studyId = new ObjectID(req.query.studyId);
    var ip = getClientAddress(req);
    var fingerprint = req.query.fingerprint;


    DB.getClient().then(function(client)
	{
		let db = client.db('site');


        db.collection('votes', function(err, collection) {
            collection.find(
            {
                studyId: studyId,
                ip: ip,
                fingerprint: fingerprint
            }).toArray(
                function(err, items) 
                {
                    if( items && items.length > 0 )
                    {
                        res.send({status:"voted", items: items});
                    }
                    else
                    {
                        res.send({status:"ok"});
                    }
                    client.close();
                });
        });
    });
}

exports.submitVote = function(req, res) {

    var studyId = req.body.studyId;
    var ip = getClientAddress(req);
    var fingerprint = req.body.fingerprint;
    var answers = JSON.parse(req.body.answers);
    var email = req.body.email;
    var contact = req.body.contact;

    var vote = 
    {
        studyId: new ObjectID(studyId),
        timestamp: new Date(),
        ip: ip,
        fingerprint: fingerprint,
        answers: answers,
        email: email,
        contact: contact
    };

    if( req.files && req.files.files && req.files.files.length > 0 )
    {
        fileService.uploadFiles( req, function(results) {
            console.log( results );
            vote.files = results;
            commonSubmit(req,res, vote);
        });
    }
    else
    {    
        commonSubmit(req,res, vote);
    }

}

function commonSubmit(req, res, vote )
{

    console.log('Adding vote: ' + vote);

	DB.getClient().then(function(client)
	{
		let db = client.db('site');
        db.collection('votes', function(err, collection) {
            collection.insert(vote, {safe:true}, function(err, result) {
                if (err) {
                    res.send({'error':'An error has occurred'});
                } else {
                    console.log('Success: ' + JSON.stringify(result[0]));
                    res.send( {'done':true });
                }
                client.close();
            });
        });
    });
}

var getClientAddress = function (req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0] 
        || req.connection.remoteAddress;
};
