function requireRole(role){
    return (req, res, next) => {
        if(!req.auth || req.auth.role !== role){
            return res.status(403).json({error: 'forbidden'});
        }
        next();
    };
}

module.exports = { requireRole };