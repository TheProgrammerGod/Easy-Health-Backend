const jwt = require('jsonwebtoken');

function authRequired(req, res, next){
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if(!token){
        return res.status(401).json({error: 'missing_token'});
    }

    try{
        const payload = jwt.verify(token, process.env.JWT_SECRET);

        req.auth = payload;
        return next();
    }
    catch {
        return res.status(401).json({error: 'invalid_or_expired_token'});
    }
}

module.exports = { authRequired };